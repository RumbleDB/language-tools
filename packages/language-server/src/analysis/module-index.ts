import type {
    AstNode as ParserAstNode,
    FunctionDeclarationAstNode,
    ModuleDeclarationAstNode,
    ModuleImportAstNode,
    NamespaceDeclarationAstNode,
    TypeDeclarationAstNode,
    VariableDeclarationAstNode,
} from "server/parser/types/ast.js";
import type { Prefix } from "server/parser/types/name.js";
import type { DocumentUri } from "vscode-languageserver";

import { defaultNamespaces } from "./default-namespaces.js";
import { SourceDefinitionFactory } from "./definition-factory.js";
import { definitionNameToString } from "./definitions.js";
import type {
    ImplicitNamespaceDefinition,
    NamespaceDefinition,
    SourceModuleExportDefinition,
    SourceTypeDefinition,
} from "./definitions.js";
import type { ModuleImport, ModuleIndex } from "./module-info.js";
import { NamespaceResolver } from "./name-resolution.js";

type ExportDeclarationAstNode =
    | FunctionDeclarationAstNode
    | VariableDeclarationAstNode
    | TypeDeclarationAstNode;

/** Extracts the dependency surface of a module without performing semantic analysis. */
class ModuleIndexBuilder {
    private readonly imports: ModuleImport[] = [];
    private readonly exports = new Map<string, SourceModuleExportDefinition>();
    private readonly namespaces = new Map<Prefix, NamespaceDefinition>(
        defaultNamespaces.entries().map(([prefix, namespaceUri]) => {
            const definition: ImplicitNamespaceDefinition = {
                kind: "namespace",
                name: { prefix },
                namespaceUri,
                origin: "implicit",
            };
            return [prefix, definition];
        }),
    );
    private readonly definitions: SourceDefinitionFactory;
    private readonly nameResolver: NamespaceResolver;
    private targetNamespace: string | undefined;

    public constructor(
        uri: DocumentUri,
        private readonly ast: ParserAstNode,
    ) {
        this.definitions = new SourceDefinitionFactory(uri);
        this.nameResolver = new NamespaceResolver(this.namespaces, () => {});
    }

    public build(): ModuleIndex {
        this.collectImportsAndNamespaceBindings(this.ast);
        for (const declaration of this.prologDeclarations()) this.indexExport(declaration);

        const base = {
            imports: this.imports,
        };
        return this.targetNamespace === undefined
            ? { ...base, kind: "main" }
            : {
                  ...base,
                  kind: "library",
                  targetNamespace: this.targetNamespace,
                  exports: this.exports,
              };
    }

    private collectImportsAndNamespaceBindings(node: ParserAstNode): void {
        switch (node.kind) {
            case "module-declaration":
                this.indexModuleDeclaration(node);
                break;
            case "module-import":
                this.indexModuleImport(node);
                return;
            case "namespace-declaration":
                this.bindNamespace(node);
                return;
            case "function-declaration":
            case "variable-declaration":
            case "type-declaration":
                return;
        }
        for (const child of node.children) this.collectImportsAndNamespaceBindings(child);
    }

    private indexModuleDeclaration(node: ModuleDeclarationAstNode): void {
        this.targetNamespace = node.namespaceUri;
        this.bindNamespace(node);
    }

    private indexModuleImport(node: ModuleImportAstNode): void {
        this.imports.push({
            ...(node.prefix === undefined ? {} : { prefix: node.prefix }),
            ...(node.prefixRange === undefined ? {} : { prefixRange: node.prefixRange }),
            namespaceUri: node.namespaceUri,
            namespaceUriRange: node.namespaceUriRange,
            locations: node.locations,
            range: node.range,
        });
        if (node.prefix !== undefined)
            this.namespaces.set(node.prefix, this.namespaceBinding(node));
    }

    private bindNamespace(node: ModuleDeclarationAstNode | NamespaceDeclarationAstNode): void {
        this.namespaces.set(node.prefix, this.namespaceBinding(node));
    }

    private namespaceBinding(
        node: ModuleDeclarationAstNode | ModuleImportAstNode | NamespaceDeclarationAstNode,
    ) {
        const prefix = node.prefix;
        if (prefix === undefined) {
            throw new Error("Cannot create a namespace binding without a prefix.");
        }
        const selectionRange =
            node.kind === "module-import" ? node.prefixRange : node.selectionRange;
        if (selectionRange === undefined) {
            throw new Error("Cannot create a namespace binding without a selection range.");
        }
        return this.definitions.namespace(prefix, node.namespaceUri, node.range, selectionRange);
    }

    private prologDeclarations(): ExportDeclarationAstNode[] {
        const declarations: ExportDeclarationAstNode[] = [];
        for (const child of this.ast.children) {
            if (this.isExportDeclaration(child)) declarations.push(child);
            else if (child.kind === "module-declaration") {
                declarations.push(...child.children.filter(this.isExportDeclaration));
            }
        }
        return declarations;
    }

    private readonly isExportDeclaration = (
        node: ParserAstNode,
    ): node is ExportDeclarationAstNode =>
        node.kind === "function-declaration" ||
        node.kind === "variable-declaration" ||
        node.kind === "type-declaration";

    private indexExport(node: ExportDeclarationAstNode): void {
        const definition = this.createExport(node);
        if (this.targetNamespace === undefined || ("isPrivate" in node && node.isPrivate)) return;
        const namespaceUri =
            definition.kind === "function"
                ? definition.name.qname.namespaceUri
                : definition.name.namespaceUri;
        if (namespaceUri !== this.targetNamespace) {
            return;
        }

        const name = definitionNameToString(definition, true);
        if (this.exports.has(name)) return;
        this.exports.set(name, definition);
    }

    private createExport(node: ExportDeclarationAstNode): SourceModuleExportDefinition {
        switch (node.kind) {
            case "variable-declaration":
                return this.definitions.variable(
                    this.nameResolver.resolveQName(node.name, node.selectionRange),
                    node.range,
                    node.selectionRange,
                );
            case "type-declaration":
                return this.definitions.type(
                    this.nameResolver.resolveQName(node.name.qname, node.selectionRange),
                    node.range,
                    node.selectionRange,
                ) satisfies SourceTypeDefinition;
            case "function-declaration": {
                const definition = this.definitions.function(
                    this.nameResolver.resolveFunctionName(node.name, node.selectionRange),
                    node.range,
                    node.selectionRange,
                );
                node.parameters.forEach((parameter) =>
                    this.definitions.addParameter(
                        parameter,
                        this.nameResolver.resolveQName(parameter.name, parameter.selectionRange),
                        definition,
                    ),
                );
                return definition;
            }
        }
    }
}

export function buildModuleIndex(uri: DocumentUri, ast: ParserAstNode): ModuleIndex {
    return new ModuleIndexBuilder(uri, ast).build();
}

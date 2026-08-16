import type {
    AstNode as ParserAstNode,
    CatchClauseAstNode,
    FlowrExpressionAstNode,
    FunctionDeclarationAstNode,
    ModuleDeclarationAstNode,
    ModuleImportAstNode,
    NamespaceDeclarationAstNode,
    TypeDeclarationAstNode,
    VariableDeclarationAstNode,
} from "server/parser/types/ast.js";
import type { Prefix } from "server/parser/types/name.js";
import { ParserAstVisitor } from "server/parser/types/visitor.js";
import { DiagnosticSeverity, type Diagnostic, type DocumentUri } from "vscode-languageserver";

import { defaultNamespaces } from "./default-namespaces.js";
import { SourceDefinitionFactory } from "./definition-factory.js";
import { definitionNameToString } from "./definitions.js";
import type {
    ImplicitNamespaceDefinition,
    NamespaceDefinition,
    SourceFunctionDefinition,
    SourceModuleExportDefinition,
    SourceNamespaceDefinition,
    SourceTypeDefinition,
    SourceVariableDefinition,
} from "./definitions.js";
import type { ModuleImport } from "./module-info.js";
import { NamespaceResolver } from "./name-resolution.js";

export type PrologDeclarationAstNode =
    | FunctionDeclarationAstNode
    | VariableDeclarationAstNode
    | TypeDeclarationAstNode;

export type PrologDefinition =
    | SourceFunctionDefinition
    | SourceVariableDefinition
    | SourceTypeDefinition;

export interface ModulePreamble {
    readonly uri: DocumentUri;
    readonly targetNamespace: string | undefined;
    readonly imports: readonly ModuleImport[];
    readonly namespaces: ReadonlyMap<Prefix, NamespaceDefinition>;
    readonly namespaceDeclarations: ReadonlyMap<
        ModuleDeclarationAstNode | ModuleImportAstNode | NamespaceDeclarationAstNode,
        SourceNamespaceDefinition
    >;
    readonly prologDefinitions: ReadonlyMap<PrologDeclarationAstNode, PrologDefinition>;
    readonly exports: ReadonlyMap<string, SourceModuleExportDefinition>;
    readonly diagnostics: readonly Diagnostic[];
    readonly definitions: SourceDefinitionFactory;
}

class ModulePreambleCollector extends ParserAstVisitor<void> {
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
    private readonly namespaceDeclarations = new Map<
        ModuleDeclarationAstNode | ModuleImportAstNode | NamespaceDeclarationAstNode,
        SourceNamespaceDefinition
    >();
    private readonly prologDefinitions = new Map<PrologDeclarationAstNode, PrologDefinition>();
    private readonly prologDeclarationNames = new Map<string, PrologDefinition>();
    private readonly diagnostics: Diagnostic[] = [];
    private readonly definitions: SourceDefinitionFactory;
    private readonly nameResolver: NamespaceResolver;
    private targetNamespace: string | undefined;

    public constructor(
        private readonly uri: DocumentUri,
        private readonly ast: ParserAstNode,
    ) {
        super();
        this.definitions = new SourceDefinitionFactory(uri);
        this.nameResolver = new NamespaceResolver(this.namespaces, (diagnostic) =>
            this.diagnostics.push(diagnostic),
        );
    }

    public collect(): ModulePreamble {
        this.visit(this.ast);

        return {
            uri: this.uri,
            targetNamespace: this.targetNamespace,
            imports: this.imports,
            namespaces: this.namespaces,
            namespaceDeclarations: this.namespaceDeclarations,
            prologDefinitions: this.prologDefinitions,
            exports: this.exports,
            diagnostics: this.diagnostics,
            definitions: this.definitions,
        };
    }

    protected override visitModuleDeclaration(node: ModuleDeclarationAstNode): void {
        if (node.namespaceUri.length === 0) {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0088",
                message: "A library module target namespace cannot be empty.",
                range: node.range,
            });
        }
        if (node.prefix === "xml" || node.prefix === "xmlns") {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0070",
                message: `Prefix '${node.prefix}' cannot be used for a library module.`,
                range: node.selectionRange,
            });
        }
        this.targetNamespace = node.namespaceUri;
        this.bindNamespace(node);
        this.visitChildren(node);
    }

    protected override visitModuleImport(node: ModuleImportAstNode): void {
        this.imports.push({
            ...(node.prefix === undefined ? {} : { prefix: node.prefix }),
            ...(node.prefixRange === undefined ? {} : { prefixRange: node.prefixRange }),
            namespaceUri: node.namespaceUri,
            namespaceUriRange: node.namespaceUriRange,
            locations: node.locations,
            range: node.range,
        });
        if (node.prefix !== undefined) {
            this.bindNamespace(node);
        }
    }

    protected override visitNamespaceDeclaration(node: NamespaceDeclarationAstNode): void {
        this.bindNamespace(node);
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): void {
        this.indexPrologDeclaration(node);
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): void {
        this.indexPrologDeclaration(node);
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): void {
        this.indexPrologDeclaration(node);
    }

    // Do not descend into expressions (such as FLWOR let/for bindings or catch clauses)
    // to prevent local variables from being indexed as module prolog declarations.
    protected override visitFlowrExpression(_node: FlowrExpressionAstNode): void {}
    protected override visitCatchClause(_node: CatchClauseAstNode): void {}

    private bindNamespace(
        node: ModuleDeclarationAstNode | ModuleImportAstNode | NamespaceDeclarationAstNode,
    ): void {
        if (node.prefix === undefined) return;
        const selectionRange =
            node.kind === "module-import" ? node.prefixRange : node.selectionRange;
        if (selectionRange === undefined) return;

        const definition = this.definitions.namespace(
            node.prefix,
            node.namespaceUri,
            node.range,
            selectionRange,
        );
        this.namespaceDeclarations.set(node, definition);
        this.namespaces.set(node.prefix, definition);
    }

    private indexPrologDeclaration(node: PrologDeclarationAstNode): void {
        const definition = this.createPrologDefinition(node);
        this.prologDefinitions.set(node, definition);

        const name = definitionNameToString(definition, true);
        if (this.prologDeclarationNames.has(name)) {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code:
                    definition.kind === "variable"
                        ? "XQST0049"
                        : definition.kind === "function"
                          ? "XQST0034"
                          : "duplicate-type",
                message: `Prolog ${definition.kind} '${name}' is defined more than once.`,
                range: definition.selectionRange,
            });
        } else {
            this.prologDeclarationNames.set(name, definition);
        }

        if (this.targetNamespace === undefined) return;

        const namespaceUri =
            definition.kind === "function"
                ? definition.name.qname.namespaceUri
                : definition.name.namespaceUri;
        if (namespaceUri !== this.targetNamespace) {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0048",
                message: `A library module declaration must use namespace '${this.targetNamespace}'.`,
                range: definition.selectionRange,
            });
            return;
        }

        if (!("isPrivate" in node && node.isPrivate)) {
            if (!this.exports.has(name)) {
                this.exports.set(name, definition);
            }
        }
    }

    private createPrologDefinition(node: PrologDeclarationAstNode): PrologDefinition {
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

export function collectModulePreamble(uri: DocumentUri, ast: ParserAstNode): ModulePreamble {
    return new ModulePreambleCollector(uri, ast).collect();
}

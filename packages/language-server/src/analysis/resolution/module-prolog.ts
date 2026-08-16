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

import { defaultNamespaces } from "../model/constants.js";
import { definitionNameToString } from "../model/definitions.js";
import type {
    ImplicitNamespaceDefinition,
    NamespaceDefinition,
    SourceFunctionDefinition,
    SourceModuleExportDefinition,
    SourceNamespaceDefinition,
    SourceTypeDefinition,
    SourceVariableDefinition,
} from "../model/definitions.js";
import type { ModuleImport } from "../model/module-info.js";
import { SourceDefinitionFactory } from "./definition-factory.js";
import { NamespaceResolver } from "./name-resolution.js";

export interface ModulePrologDeclarations {
    readonly namespaces: ReadonlyMap<
        ModuleDeclarationAstNode | ModuleImportAstNode | NamespaceDeclarationAstNode,
        SourceNamespaceDefinition
    >;
    readonly functions: ReadonlyMap<FunctionDeclarationAstNode, SourceFunctionDefinition>;
    readonly variables: ReadonlyMap<VariableDeclarationAstNode, SourceVariableDefinition>;
    readonly types: ReadonlyMap<TypeDeclarationAstNode, SourceTypeDefinition>;
}

export interface ModuleProlog {
    readonly uri: DocumentUri;
    readonly targetNamespace: string | undefined;
    readonly imports: readonly ModuleImport[];
    readonly namespaces: ReadonlyMap<Prefix, NamespaceDefinition>;
    readonly declarations: ModulePrologDeclarations;
    readonly exports: ReadonlyMap<string, SourceModuleExportDefinition>;
    readonly diagnostics: readonly Diagnostic[];
    readonly definitions: SourceDefinitionFactory;
}

class ModulePrologCollector extends ParserAstVisitor<void> {
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
    private readonly declarations = {
        namespaces: new Map<
            ModuleDeclarationAstNode | ModuleImportAstNode | NamespaceDeclarationAstNode,
            SourceNamespaceDefinition
        >(),
        functions: new Map<FunctionDeclarationAstNode, SourceFunctionDefinition>(),
        variables: new Map<VariableDeclarationAstNode, SourceVariableDefinition>(),
        types: new Map<TypeDeclarationAstNode, SourceTypeDefinition>(),
    };
    private readonly prologDeclarationNames = new Map<
        string,
        SourceFunctionDefinition | SourceVariableDefinition | SourceTypeDefinition
    >();
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

    public collect(): ModuleProlog {
        this.visit(this.ast);

        return {
            uri: this.uri,
            targetNamespace: this.targetNamespace,
            imports: this.imports,
            namespaces: this.namespaces,
            declarations: this.declarations,
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
        this.declarations.functions.set(node, definition);
        this.checkDeclaration(node, definition);
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): void {
        const definition = this.definitions.variable(
            this.nameResolver.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.declarations.variables.set(node, definition);
        this.checkDeclaration(node, definition);
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): void {
        const definition = this.definitions.type(
            this.nameResolver.resolveQName(node.name.qname, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.declarations.types.set(node, definition);
        this.checkDeclaration(node, definition);
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
        this.declarations.namespaces.set(node, definition);
        this.namespaces.set(node.prefix, definition);
    }

    private checkDeclaration(
        node: FunctionDeclarationAstNode | VariableDeclarationAstNode | TypeDeclarationAstNode,
        definition: SourceFunctionDefinition | SourceVariableDefinition | SourceTypeDefinition,
    ): void {
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
}

export function collectModuleProlog(uri: DocumentUri, ast: ParserAstNode): ModuleProlog {
    return new ModulePrologCollector(uri, ast).collect();
}

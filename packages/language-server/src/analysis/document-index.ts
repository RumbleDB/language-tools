import { parseDocument } from "server/parser/index.js";
import type {
    AstNode as ParserAstNode,
    AstParameter,
    ContextItemDeclarationAstNode,
    FunctionDeclarationAstNode,
    ModuleDeclarationAstNode,
    ModuleImportAstNode,
    NamespaceDeclarationAstNode,
    TypeDeclarationAstNode,
    VariableDeclarationAstNode,
} from "server/parser/types/ast.js";
import {
    isPrefixedQName,
    isUriQualifiedQName,
    type LexicalFunctionName,
    type LexicalQName,
    type Prefix,
} from "server/parser/types/name.js";
import { ParserAstVisitor } from "server/parser/types/visitor.js";
import { DiagnosticSeverity, type Diagnostic, type Range } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { defaultNamespaces } from "./default-namespaces.js";
import type {
    ImplicitNamespaceDefinition,
    NamespaceDefinition,
    SourceDefinition,
    SourceFunctionDefinition,
    SourceModuleExportDefinition,
    SourceNamespaceDefinition,
    SourceParameterDefinition,
    SourceVariableDefinition,
} from "./definitions.js";
import type { ModuleDeclaration, ModuleImport, ModuleInterface } from "./module-info.js";
import type { FunctionName, QName } from "./names.js";

export interface DocumentIndex {
    readonly document: TextDocument;
    readonly ast: ParserAstNode;
    readonly moduleDeclaration: ModuleDeclaration;
    readonly moduleInterface?: ModuleInterface;
    readonly namespaces: ReadonlyMap<Prefix, NamespaceDefinition>;
    readonly definitions: readonly SourceDefinition[];
    readonly indexedDefinitions: IndexedDefinitions;
    readonly diagnostics: readonly Diagnostic[];
}

export interface IndexedDefinitions {
    readonly namespaces: ReadonlyMap<
        ModuleDeclarationAstNode | ModuleImportAstNode | NamespaceDeclarationAstNode,
        SourceNamespaceDefinition
    >;
    readonly contextItems: ReadonlyMap<ContextItemDeclarationAstNode, SourceVariableDefinition>;
    readonly types: ReadonlyMap<
        TypeDeclarationAstNode,
        Extract<SourceDefinition, { kind: "type" }>
    >;
    readonly functions: ReadonlyMap<FunctionDeclarationAstNode, SourceFunctionDefinition>;
    readonly variables: ReadonlyMap<VariableDeclarationAstNode, SourceVariableDefinition>;
    readonly parameters: ReadonlyMap<AstParameter, SourceParameterDefinition>;
}

class DocumentIndexBuilder extends ParserAstVisitor<void> {
    private readonly definitions: SourceDefinition[] = [];
    private readonly indexedDefinitions = {
        namespaces: new Map<
            ModuleDeclarationAstNode | ModuleImportAstNode | NamespaceDeclarationAstNode,
            SourceNamespaceDefinition
        >(),
        contextItems: new Map<ContextItemDeclarationAstNode, SourceVariableDefinition>(),
        types: new Map<TypeDeclarationAstNode, Extract<SourceDefinition, { kind: "type" }>>(),
        functions: new Map<FunctionDeclarationAstNode, SourceFunctionDefinition>(),
        variables: new Map<VariableDeclarationAstNode, SourceVariableDefinition>(),
        parameters: new Map<AstParameter, SourceParameterDefinition>(),
    } satisfies IndexedDefinitions;
    private readonly diagnostics: Diagnostic[] = [];
    private readonly imports: ModuleImport[] = [];
    private readonly exports: SourceModuleExportDefinition[] = [];
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
    private moduleDeclaration: ModuleDeclaration = { kind: "main", imports: this.imports };
    private moduleInterface: ModuleInterface | undefined;
    private readonly moduleLevelDeclarations = new Set<ParserAstNode>();

    public constructor(
        private readonly document: TextDocument,
        private readonly ast: ParserAstNode,
    ) {
        super();
    }

    public build(): DocumentIndex {
        this.indexStaticContext(this.ast);
        this.visit(this.ast);
        return {
            document: this.document,
            ast: this.ast,
            moduleDeclaration: this.moduleDeclaration,
            ...(this.moduleInterface === undefined
                ? {}
                : { moduleInterface: this.moduleInterface }),
            namespaces: this.namespaces,
            definitions: this.definitions,
            indexedDefinitions: this.indexedDefinitions,
            diagnostics: this.diagnostics,
        };
    }

    protected override visitModuleDeclaration(node: ModuleDeclarationAstNode): void {
        this.visitChildren(node);
    }

    protected override visitModuleImport(_node: ModuleImportAstNode): void {}

    protected override visitNamespaceDeclaration(_node: NamespaceDeclarationAstNode): void {}

    private indexStaticContext(node: ParserAstNode): void {
        switch (node.kind) {
            case "module-declaration":
                this.indexModuleDeclaration(node);
                break;
            case "module-import":
                this.indexModuleImport(node);
                return;
            case "namespace-declaration":
                this.indexNamespaceDeclaration(node);
                return;
            case "function-declaration":
            case "variable-declaration":
                return;
        }
        for (const child of node.children) this.indexStaticContext(child);
    }

    private indexModuleDeclaration(node: ModuleDeclarationAstNode): void {
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

        const definition: SourceNamespaceDefinition = {
            ...this.sourceDefinitionBase(node.range, node.selectionRange),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.definitions.push(definition);
        this.indexedDefinitions.namespaces.set(node, definition);
        this.namespaces.set(node.prefix, definition);
        this.moduleDeclaration = {
            kind: "library",
            targetNamespace: definition,
            imports: this.imports,
        };
        this.moduleInterface = {
            namespaceUri: definition.namespaceUri,
            exports: this.exports,
        };
        for (const child of node.children) {
            if (child.kind === "function-declaration" || child.kind === "variable-declaration") {
                this.moduleLevelDeclarations.add(child);
            }
        }
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
        if (node.prefix === undefined || node.prefixRange === undefined) return;

        const definition: SourceNamespaceDefinition = {
            ...this.sourceDefinitionBase(node.range, node.prefixRange),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.definitions.push(definition);
        this.indexedDefinitions.namespaces.set(node, definition);
        this.namespaces.set(node.prefix, definition);
    }

    private indexNamespaceDeclaration(node: NamespaceDeclarationAstNode): void {
        const definition: SourceNamespaceDefinition = {
            ...this.sourceDefinitionBase(node.range, node.selectionRange),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.definitions.push(definition);
        this.indexedDefinitions.namespaces.set(node, definition);
        this.namespaces.set(node.prefix, definition);
    }

    protected override visitContextItemDeclaration(node: ContextItemDeclarationAstNode): void {
        const definition = this.variableDefinition(
            this.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.definitions.push(definition);
        this.indexedDefinitions.contextItems.set(node, definition);
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): void {
        const definition: Extract<SourceDefinition, { kind: "type" }> = {
            ...this.sourceDefinitionBase(node.range, node.selectionRange),
            kind: "type",
            name: this.resolveQName(node.name.qname, node.selectionRange),
        };
        this.definitions.push(definition);
        this.indexedDefinitions.types.set(node, definition);
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): void {
        const definition: SourceFunctionDefinition = {
            ...this.sourceDefinitionBase(node.range, node.selectionRange),
            kind: "function",
            name: this.resolveFunctionName(node.name, node.selectionRange),
            parameters: [],
            isPrivate: node.isPrivate,
        };
        this.definitions.push(definition);
        this.indexedDefinitions.functions.set(node, definition);
        this.recordLibraryDeclaration(node, definition);

        for (const parameter of node.parameters) {
            const parameterDefinition: SourceParameterDefinition = {
                ...this.sourceDefinitionBase(parameter.range, parameter.selectionRange),
                kind: "parameter",
                name: this.resolveQName(parameter.name, parameter.selectionRange),
                function: definition,
            };
            this.definitions.push(parameterDefinition);
            this.indexedDefinitions.parameters.set(parameter, parameterDefinition);
            definition.parameters.push(parameterDefinition);
        }
        this.visitChildren(node);
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): void {
        const definition = this.variableDefinition(
            this.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
            node.isPrivate,
        );
        this.definitions.push(definition);
        this.indexedDefinitions.variables.set(node, definition);
        this.recordLibraryDeclaration(node, definition);
        this.visitChildren(node);
    }

    private recordLibraryDeclaration(
        node: FunctionDeclarationAstNode | VariableDeclarationAstNode,
        definition: SourceFunctionDefinition | SourceVariableDefinition,
    ): void {
        if (this.moduleDeclaration.kind !== "library" || !this.moduleLevelDeclarations.has(node))
            return;

        const namespaceUri =
            definition.kind === "function"
                ? definition.name.qname.namespaceUri
                : definition.name.namespaceUri;
        if (namespaceUri === this.moduleDeclaration.targetNamespace.namespaceUri) {
            if (!definition.isPrivate) this.exports.push(definition);
            return;
        }
        this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            code: "XQST0048",
            message: `A library module declaration must use namespace '${this.moduleDeclaration.targetNamespace.namespaceUri}'.`,
            range: definition.selectionRange,
        });
    }

    private sourceDefinitionBase(range: Range, selectionRange: Range) {
        return {
            uri: this.document.uri,
            range,
            selectionRange,
            origin: "source" as const,
        };
    }

    private variableDefinition(
        name: QName,
        range: Range,
        selectionRange: Range,
        isPrivate: boolean = false,
    ): SourceVariableDefinition {
        return {
            ...this.sourceDefinitionBase(range, selectionRange),
            kind: "variable",
            name,
            isPrivate,
        };
    }

    private resolveFunctionName(name: LexicalFunctionName, range: Range): FunctionName {
        return { ...name, qname: this.resolveQName(name.qname, range) };
    }

    private resolveQName(qname: LexicalQName, range: Range): QName {
        const namespaceUri = isUriQualifiedQName(qname)
            ? qname.namespaceUri
            : isPrefixedQName(qname)
              ? this.namespaces.get(qname.prefix)?.namespaceUri
              : undefined;

        if (namespaceUri === undefined && isPrefixedQName(qname)) {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                message: `Undefined namespace prefix '${qname.prefix}'`,
                range,
                code: "undefined-namespace-prefix",
            });
        }

        return {
            localName: qname.localName,
            ...(namespaceUri === undefined ? {} : { namespaceUri }),
            ...(isPrefixedQName(qname) ? { prefix: qname.prefix } : {}),
        };
    }
}

export function buildDocumentIndex(document: TextDocument): DocumentIndex {
    return new DocumentIndexBuilder(document, parseDocument(document).ast).build();
}

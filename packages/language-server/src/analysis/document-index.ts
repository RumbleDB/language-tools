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
import type { Prefix } from "server/parser/types/name.js";
import { ParserAstVisitor } from "server/parser/types/visitor.js";
import { DiagnosticSeverity, type Diagnostic, type Range } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { defaultNamespaces } from "./default-namespaces.js";
import { definitionNameToString } from "./definitions.js";
import type {
    ImplicitNamespaceDefinition,
    NamespaceDefinition,
    SourceDefinition,
    SourceFunctionDefinition,
    SourceNamespaceDefinition,
    SourceParameterDefinition,
    SymbolId,
    SourceVariableDefinition,
} from "./definitions.js";
import type { ModuleDeclaration, ModuleInterface } from "./module-info.js";
import { NamespaceResolver } from "./name-resolution.js";
import { functionNameToString, QNameToString, type QName } from "./names.js";

export interface DocumentIndex {
    /** The text document being analyzed. */
    readonly document: TextDocument;

    /** Parsed AST root node */
    readonly ast: ParserAstNode;

    /** Whether the document is a main or library module, in case of library module, the target namespace */
    moduleDeclaration: ModuleDeclaration;

    /** The module interface, if the document is a library module */
    moduleInterface?: ModuleInterface;

    /** Namespace declarations in the document, including implicit namespaces */
    readonly namespaces: Map<Prefix, NamespaceDefinition>;

    /** All source definitions in the document */
    readonly definitions: SourceDefinition[];

    /**
     * Function and variable declarations in the module Prolog.
     *
     * Unlike expression-level bindings, these declarations form the module static
     * context and are visible throughout the Prolog (subject to the declaring
     * variable being excluded from its own initializer).
     */
    readonly prologDeclarations: Set<FunctionDeclarationAstNode | VariableDeclarationAstNode>;

    /**
     * Maps connecting parser AST nodes to those definitions
     *
     * This will be used in the analyzer to avoid rebuilding the definitions from the AST nodes, and to connect references to their definitions.
     */
    readonly indexedDefinitions: IndexedDefinitions;
    readonly diagnostics: Diagnostic[];
}

export interface IndexedDefinitions {
    readonly namespaces: Map<
        ModuleDeclarationAstNode | ModuleImportAstNode | NamespaceDeclarationAstNode,
        SourceNamespaceDefinition
    >;
    readonly contextItems: Map<ContextItemDeclarationAstNode, SourceVariableDefinition>;
    readonly types: Map<TypeDeclarationAstNode, Extract<SourceDefinition, { kind: "type" }>>;
    readonly functions: Map<FunctionDeclarationAstNode, SourceFunctionDefinition>;
    readonly variables: Map<VariableDeclarationAstNode, SourceVariableDefinition>;
    readonly parameters: Map<AstParameter, SourceParameterDefinition>;
}

/**
 * Document index is the first-stage analysis result for one document
 *
 * It parses the source and records facts that can be discovered without loading or semantically resolving imported modules.
 *
 * The result, DocumentIndex, is passed to analyzeDocument, which builds scopes and resolves references, using exports loaded from other documents when necessary.
 */
class DocumentIndexBuilder extends ParserAstVisitor<void> {
    private readonly result: DocumentIndex;
    private readonly nameResolver: NamespaceResolver;
    private readonly symbolOccurrences = new Map<string, number>();
    private readonly moduleLevelDeclarations = new Set<ParserAstNode>();
    private readonly prologDefinitionsByName = new Map<
        string,
        SourceFunctionDefinition | SourceVariableDefinition
    >();

    public constructor(document: TextDocument, ast: ParserAstNode) {
        super();
        this.result = {
            document,
            ast,
            moduleDeclaration: { kind: "main", imports: [] },
            namespaces: new Map(
                defaultNamespaces.entries().map(([prefix, namespaceUri]) => {
                    const definition: ImplicitNamespaceDefinition = {
                        kind: "namespace",
                        name: { prefix },
                        namespaceUri,
                        origin: "implicit",
                    };
                    return [prefix, definition];
                }),
            ),
            definitions: [],
            indexedDefinitions: {
                namespaces: new Map(),
                contextItems: new Map(),
                types: new Map(),
                functions: new Map(),
                variables: new Map(),
                parameters: new Map(),
            },
            diagnostics: [],
            prologDeclarations: new Set(),
        };
        this.nameResolver = new NamespaceResolver(this.result.namespaces, (diagnostic) =>
            this.result.diagnostics.push(diagnostic),
        );
    }

    public build(): DocumentIndex {
        this.indexStaticContext(this.result.ast);
        this.indexPrologDeclarations(this.result.ast);
        this.visit(this.result.ast);
        return this.result;
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

    private indexPrologDeclarations(module: ParserAstNode): void {
        for (const child of module.children) {
            if (child.kind === "function-declaration" || child.kind === "variable-declaration") {
                this.result.prologDeclarations.add(child);
                continue;
            }

            // A library module owns its Prolog in the parser AST; the main-module
            // Prolog is represented directly under the module root.
            if (child.kind !== "module-declaration") continue;
            for (const declaration of child.children) {
                if (
                    declaration.kind === "function-declaration" ||
                    declaration.kind === "variable-declaration"
                ) {
                    this.result.prologDeclarations.add(declaration);
                }
            }
        }
    }

    private indexModuleDeclaration(node: ModuleDeclarationAstNode): void {
        if (node.namespaceUri.length === 0) {
            this.result.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0088",
                message: "A library module target namespace cannot be empty.",
                range: node.range,
            });
        }
        if (node.prefix === "xml" || node.prefix === "xmlns") {
            this.result.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0070",
                message: `Prefix '${node.prefix}' cannot be used for a library module.`,
                range: node.selectionRange,
            });
        }

        const definition: SourceNamespaceDefinition = {
            ...this.sourceDefinitionBase(
                node.range,
                node.selectionRange,
                `namespace:${node.prefix}`,
            ),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.result.definitions.push(definition);
        this.result.indexedDefinitions.namespaces.set(node, definition);
        this.result.namespaces.set(node.prefix, definition);
        this.result.moduleDeclaration = {
            kind: "library",
            targetNamespace: definition,
            imports: this.result.moduleDeclaration.imports,
        };
        this.result.moduleInterface = {
            namespaceUri: definition.namespaceUri,
            exports: new Map(),
        };
        for (const child of node.children) {
            if (child.kind === "function-declaration" || child.kind === "variable-declaration") {
                this.moduleLevelDeclarations.add(child);
            }
        }
    }

    private indexModuleImport(node: ModuleImportAstNode): void {
        this.result.moduleDeclaration.imports.push({
            ...(node.prefix === undefined ? {} : { prefix: node.prefix }),
            ...(node.prefixRange === undefined ? {} : { prefixRange: node.prefixRange }),
            namespaceUri: node.namespaceUri,
            namespaceUriRange: node.namespaceUriRange,
            locations: node.locations,
            range: node.range,
        });
        if (node.prefix === undefined || node.prefixRange === undefined) return;

        const definition: SourceNamespaceDefinition = {
            ...this.sourceDefinitionBase(node.range, node.prefixRange, `namespace:${node.prefix}`),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.result.definitions.push(definition);
        this.result.indexedDefinitions.namespaces.set(node, definition);
        this.result.namespaces.set(node.prefix, definition);
    }

    private indexNamespaceDeclaration(node: NamespaceDeclarationAstNode): void {
        const definition: SourceNamespaceDefinition = {
            ...this.sourceDefinitionBase(
                node.range,
                node.selectionRange,
                `namespace:${node.prefix}`,
            ),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.result.definitions.push(definition);
        this.result.indexedDefinitions.namespaces.set(node, definition);
        this.result.namespaces.set(node.prefix, definition);
    }

    protected override visitContextItemDeclaration(node: ContextItemDeclarationAstNode): void {
        const definition = this.variableDefinition(
            this.nameResolver.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.result.definitions.push(definition);
        this.result.indexedDefinitions.contextItems.set(node, definition);
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): void {
        const name = this.nameResolver.resolveQName(node.name.qname, node.selectionRange);
        const definition: Extract<SourceDefinition, { kind: "type" }> = {
            ...this.sourceDefinitionBase(
                node.range,
                node.selectionRange,
                `type:${QNameToString(name, true)}`,
            ),
            kind: "type",
            name,
        };
        this.result.definitions.push(definition);
        this.result.indexedDefinitions.types.set(node, definition);
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): void {
        const parameters: SourceParameterDefinition[] = [];
        const name = this.nameResolver.resolveFunctionName(node.name, node.selectionRange);
        const definition: SourceFunctionDefinition = {
            ...this.sourceDefinitionBase(
                node.range,
                node.selectionRange,
                `function:${functionNameToString(name, true)}`,
            ),
            kind: "function",
            name,
            parameters,
        };
        this.result.definitions.push(definition);
        this.result.indexedDefinitions.functions.set(node, definition);
        if (!this.recordDuplicatePrologDeclaration(node, definition)) {
            this.recordLibraryDeclaration(node, definition);
        }

        for (const parameter of node.parameters) {
            const parameterDefinition: SourceParameterDefinition = {
                ...this.sourceDefinitionBase(
                    parameter.range,
                    parameter.selectionRange,
                    `${definition.id}:parameter:${parameter.index}`,
                ),
                kind: "parameter",
                name: this.nameResolver.resolveQName(parameter.name, parameter.selectionRange),
                function: definition,
            };
            this.result.definitions.push(parameterDefinition);
            this.result.indexedDefinitions.parameters.set(parameter, parameterDefinition);
            parameters.push(parameterDefinition);
        }
        this.visitChildren(node);
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): void {
        const definition = this.variableDefinition(
            this.nameResolver.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.result.definitions.push(definition);
        this.result.indexedDefinitions.variables.set(node, definition);
        if (!this.recordDuplicatePrologDeclaration(node, definition)) {
            this.recordLibraryDeclaration(node, definition);
        }
        this.visitChildren(node);
    }

    private recordDuplicatePrologDeclaration(
        node: FunctionDeclarationAstNode | VariableDeclarationAstNode,
        definition: SourceFunctionDefinition | SourceVariableDefinition,
    ): boolean {
        if (!this.result.prologDeclarations.has(node)) return false;

        const name = definitionNameToString(definition, true);
        if (this.prologDefinitionsByName.has(name)) {
            this.result.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: definition.kind === "variable" ? "XQST0049" : "XQST0034",
                message: `Prolog ${definition.kind} '${name}' is defined more than once.`,
                range: definition.selectionRange,
            });
            return true;
        }

        this.prologDefinitionsByName.set(name, definition);
        return false;
    }

    private recordLibraryDeclaration(
        node: FunctionDeclarationAstNode | VariableDeclarationAstNode,
        definition: SourceFunctionDefinition | SourceVariableDefinition,
    ): void {
        if (
            this.result.moduleDeclaration.kind !== "library" ||
            !this.moduleLevelDeclarations.has(node)
        )
            return;

        const namespaceUri =
            definition.kind === "function"
                ? definition.name.qname.namespaceUri
                : definition.name.namespaceUri;
        if (namespaceUri === this.result.moduleDeclaration.targetNamespace.namespaceUri) {
            if (node.isPrivate || this.result.moduleInterface === undefined) return;

            const name = definitionNameToString(definition, true);
            if (this.result.moduleInterface.exports.has(name)) {
                this.result.diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    code: definition.kind === "variable" ? "XQST0049" : "XQST0034",
                    message: `Module export '${name}' is defined more than once.`,
                    range: definition.selectionRange,
                });
                return;
            }
            this.result.moduleInterface.exports.set(name, definition);
            return;
        }
        this.result.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            code: "XQST0048",
            message: `A library module declaration must use namespace '${this.result.moduleDeclaration.targetNamespace.namespaceUri}'.`,
            range: definition.selectionRange,
        });
    }

    private sourceDefinitionBase(range: Range, selectionRange: Range, symbolKey: string) {
        const occurrence = this.symbolOccurrences.get(symbolKey) ?? 0;
        this.symbolOccurrences.set(symbolKey, occurrence + 1);
        return {
            id: `${this.result.document.uri}#${encodeURIComponent(symbolKey)}:${occurrence}` as SymbolId,
            uri: this.result.document.uri,
            range,
            selectionRange,
            origin: "source" as const,
        };
    }

    private variableDefinition(
        name: QName,
        range: Range,
        selectionRange: Range,
    ): SourceVariableDefinition {
        return {
            ...this.sourceDefinitionBase(
                range,
                selectionRange,
                `variable:${QNameToString(name, true)}`,
            ),
            kind: "variable",
            name,
        };
    }
}

export function buildDocumentIndex(document: TextDocument, ast: ParserAstNode): DocumentIndex {
    return new DocumentIndexBuilder(document, ast).build();
}

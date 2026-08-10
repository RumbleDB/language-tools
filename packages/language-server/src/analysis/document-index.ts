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
    readonly ast: ParserAstNode;
    readonly moduleDeclaration: ModuleDeclaration;
    readonly moduleInterface?: ModuleInterface;
    readonly namespaces: ReadonlyMap<Prefix, NamespaceDefinition>;
    readonly definitions: readonly SourceDefinition[];
    readonly definitionsByNode: ReadonlyMap<ParserAstNode | AstParameter, SourceDefinition>;
    readonly diagnostics: readonly Diagnostic[];
}

class DocumentIndexBuilder extends ParserAstVisitor<void> {
    private readonly definitions: SourceDefinition[] = [];
    private readonly definitionsByNode = new Map<ParserAstNode | AstParameter, SourceDefinition>();
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
    private atModuleLevel = false;

    public constructor(
        private readonly document: TextDocument,
        private readonly ast: ParserAstNode,
    ) {
        super();
    }

    public build(): DocumentIndex {
        this.visit(this.ast);
        return {
            ast: this.ast,
            moduleDeclaration: this.moduleDeclaration,
            ...(this.moduleInterface === undefined
                ? {}
                : { moduleInterface: this.moduleInterface }),
            namespaces: this.namespaces,
            definitions: this.definitions,
            definitionsByNode: this.definitionsByNode,
            diagnostics: this.diagnostics,
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

        const definition: SourceNamespaceDefinition = {
            ...this.sourceDefinitionBase(node.range, node.selectionRange),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.recordDefinition(node, definition);
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
        this.visitChildrenAtModuleLevel(node);
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
        if (node.prefix === undefined || node.prefixRange === undefined) return;

        const definition: SourceNamespaceDefinition = {
            ...this.sourceDefinitionBase(node.range, node.prefixRange),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.recordDefinition(node, definition);
        this.namespaces.set(node.prefix, definition);
    }

    protected override visitNamespaceDeclaration(node: NamespaceDeclarationAstNode): void {
        const definition: SourceNamespaceDefinition = {
            ...this.sourceDefinitionBase(node.range, node.selectionRange),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.recordDefinition(node, definition);
        this.namespaces.set(node.prefix, definition);
    }

    protected override visitContextItemDeclaration(node: ContextItemDeclarationAstNode): void {
        this.recordDefinition(
            node,
            this.variableDefinition(
                this.resolveQName(node.name, node.selectionRange),
                node.range,
                node.selectionRange,
            ),
        );
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): void {
        this.recordDefinition(node, {
            ...this.sourceDefinitionBase(node.range, node.selectionRange),
            kind: "type",
            name: this.resolveQName(node.name.qname, node.selectionRange),
        });
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): void {
        const definition: SourceFunctionDefinition = {
            ...this.sourceDefinitionBase(node.range, node.selectionRange),
            kind: "function",
            name: this.resolveFunctionName(node.name, node.selectionRange),
            parameters: [],
            isPrivate: node.isPrivate,
        };
        this.recordDefinition(node, definition);
        this.recordLibraryDeclaration(definition);

        for (const parameter of node.parameters) {
            const parameterDefinition: SourceParameterDefinition = {
                ...this.sourceDefinitionBase(parameter.range, parameter.selectionRange),
                kind: "parameter",
                name: this.resolveQName(parameter.name, parameter.selectionRange),
                function: definition,
            };
            this.recordDefinition(parameter, parameterDefinition);
            definition.parameters.push(parameterDefinition);
        }
        this.visitChildrenBelowModuleLevel(node);
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): void {
        const definition = this.variableDefinition(
            this.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
            node.isPrivate,
        );
        this.recordDefinition(node, definition);
        this.recordLibraryDeclaration(definition);
        this.visitChildrenBelowModuleLevel(node);
    }

    private visitChildrenAtModuleLevel(node: ParserAstNode): void {
        const previous = this.atModuleLevel;
        this.atModuleLevel = true;
        this.visitChildren(node);
        this.atModuleLevel = previous;
    }

    private visitChildrenBelowModuleLevel(node: ParserAstNode): void {
        const previous = this.atModuleLevel;
        this.atModuleLevel = false;
        this.visitChildren(node);
        this.atModuleLevel = previous;
    }

    private recordDefinition(
        node: ParserAstNode | AstParameter,
        definition: SourceDefinition,
    ): void {
        this.definitions.push(definition);
        this.definitionsByNode.set(node, definition);
    }

    private recordLibraryDeclaration(
        definition: SourceFunctionDefinition | SourceVariableDefinition,
    ): void {
        if (this.moduleDeclaration.kind !== "library" || !this.atModuleLevel) return;

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

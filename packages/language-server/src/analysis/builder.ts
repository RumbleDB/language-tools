import { builtinFunctions } from "server/assets/builtin-functions.js";
import { parseDocument } from "server/parser/index.js";
import type {
    ArgumentAstNode,
    AstNode as ParserAstNode,
    AstParameter,
    CatchClauseAstNode,
    ContextItemDeclarationAstNode,
    ContextItemExpressionAstNode,
    FlowrExpressionAstNode,
    FunctionCallAstNode,
    FunctionDeclarationAstNode,
    NamespaceDeclarationAstNode,
    ModuleDeclarationAstNode,
    ModuleImportAstNode,
    NamedFunctionReferenceAstNode,
    TypeDeclarationAstNode,
    VariableDeclarationAstNode,
    VariableReferenceAstNode,
    TypeReferenceAstNode,
} from "server/parser/types/ast.js";
import {
    isPrefixedQName,
    isUriQualifiedQName,
    Prefix,
    type LexicalFunctionName,
    type LexicalQName,
} from "server/parser/types/name.js";
import { ParserAstVisitor } from "server/parser/types/visitor.js";
import { Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type {
    ArgumentNode,
    AstNode,
    DeclarationNode,
    FunctionCallNode,
    ModuleNode,
    ReferenceNode,
} from "./ast.js";
import { defaultNamespaces } from "./default-namespaces.js";
import {
    Definition,
    DefinitionByReferenceKind,
    ImplicitNamespaceDefinition,
    ImplicitVariableDefinition,
    NamespaceDefinition,
    ScopeDefinition,
    SourceDefinition,
    SourceFunctionDefinition,
    SourceModuleExportDefinition,
    SourceNamespaceDefinition,
    SourceParameterDefinition,
    SourceVariableDefinition,
} from "./definitions.js";
import {
    referenceNameToString,
    type FunctionName,
    type QName,
    type ReferenceNameByKind,
} from "./names.js";
import { AnyResolvedReference, ResolvedReference } from "./reference.js";
import { Scope } from "./scope.js";

const CATCH_VARIABLES = [
    { kind: "prefixed-qname", prefix: "err", localName: "code" },
    { kind: "prefixed-qname", prefix: "err", localName: "description" },
    { kind: "prefixed-qname", prefix: "err", localName: "value" },
    { kind: "prefixed-qname", prefix: "err", localName: "module" },
    { kind: "prefixed-qname", prefix: "err", localName: "line-number" },
    { kind: "prefixed-qname", prefix: "err", localName: "column-number" },
    { kind: "prefixed-qname", prefix: "err", localName: "additional" },
] as const;

export interface AnalysisResult {
    ast: ModuleNode;
    scope: Scope;
    namespaces: Map<Prefix, NamespaceDefinition>;
    definitions: readonly SourceDefinition[];
    references: readonly AnyResolvedReference[];
    referencesByDefinition: ReadonlyMap<Definition, readonly AnyResolvedReference[]>;
    diagnostics: Diagnostic[];
}

/** Declarations made visible by a directly imported library module. */
export interface ResolvedModuleImport {
    readonly targetNamespaceUri: string;
    readonly exports: readonly SourceModuleExportDefinition[];
}

class AnalysisBuilder extends ParserAstVisitor<AstNode[]> {
    private readonly definitions: SourceDefinition[] = [];

    private readonly references: AnyResolvedReference[] = [];

    private readonly referencesByDefinition = new Map<Definition, AnyResolvedReference[]>();

    private readonly result: AnalysisResult;

    private currentScope: Scope;

    private readonly document: TextDocument;

    private readonly parserAst: ParserAstNode;

    private moduleNamespaceUri: string | undefined;

    private readonly moduleImportsByNamespace: ReadonlyMap<string, ResolvedModuleImport>;

    public constructor(
        document: TextDocument,
        moduleImports: readonly ResolvedModuleImport[] = [],
    ) {
        super();
        this.document = document;
        this.moduleImportsByNamespace = new Map(
            moduleImports.map((moduleImport) => [moduleImport.targetNamespaceUri, moduleImport]),
        );

        this.parserAst = parseDocument(document).ast;
        const namespaces = new Map<string, NamespaceDefinition>(
            defaultNamespaces.entries().map((ns) => {
                const definition: ImplicitNamespaceDefinition = {
                    kind: "namespace",
                    name: { prefix: ns[0] },
                    namespaceUri: ns[1],
                    origin: "implicit",
                };
                return [ns[0], definition] as const;
            }),
        );
        const moduleScope = Scope.module(document);

        this.result = {
            ast: {
                kind: "module",
                range: this.parserAst.range,
                children: [],
            },
            scope: moduleScope,
            namespaces,
            definitions: this.definitions,
            references: this.references,
            referencesByDefinition: this.referencesByDefinition,
            diagnostics: [],
        };

        this.currentScope = moduleScope;
    }

    public build(): AnalysisResult {
        this.adoptChildren(this.result.ast, this.visitChildrenAsNodes(this.parserAst));
        return this.result;
    }

    protected override defaultVisit(node: ParserAstNode): AstNode[] {
        return this.visitChildrenAsNodes(node);
    }

    protected override visitNamespaceDeclaration(node: NamespaceDeclarationAstNode): AstNode[] {
        const definition: SourceNamespaceDefinition = {
            ...this.createSourceDefinitionBase(node.range, node.selectionRange),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.definitions.push(definition);
        this.result.namespaces.set(definition.name.prefix, definition);
        return [this.createDeclarationNode(definition)];
    }

    protected override visitModuleDeclaration(node: ModuleDeclarationAstNode): AstNode[] {
        this.moduleNamespaceUri = node.namespaceUri;
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
            ...this.createSourceDefinitionBase(node.range, node.selectionRange),
            kind: "namespace",
            name: { prefix: node.prefix },
            namespaceUri: node.namespaceUri,
        };
        this.definitions.push(definition);
        this.result.namespaces.set(definition.name.prefix, definition);
        // A library module declaration owns its prolog in the parser AST. Keep its
        // namespace declaration and visit that prolog so library functions and
        // variables participate in analysis.
        return [this.createDeclarationNode(definition), ...this.visitChildrenAsNodes(node)];
    }

    protected override visitModuleImport(node: ModuleImportAstNode): AstNode[] {
        const declarations: DeclarationNode[] = [];
        if (node.prefix !== undefined && node.prefixRange !== undefined) {
            const definition: SourceNamespaceDefinition = {
                ...this.createSourceDefinitionBase(node.range, node.prefixRange),
                kind: "namespace",
                name: { prefix: node.prefix },
                namespaceUri: node.namespaceUri,
            };
            this.definitions.push(definition);
            this.result.namespaces.set(node.prefix, definition);
            declarations.push(this.createDeclarationNode(definition));
        }

        const resolvedImport = this.moduleImportsByNamespace.get(node.namespaceUri);
        for (const declaration of resolvedImport?.exports ?? []) {
            this.declareDefinition(declaration, 0);
        }
        return declarations;
    }

    protected override visitContextItemDeclaration(node: ContextItemDeclarationAstNode): AstNode[] {
        const definition = this.createVariableDefinition(
            this.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.declareDefinition(definition, this.document.offsetAt(node.range.end));
        return [this.createDeclarationNode(definition)];
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): AstNode[] {
        const definition: Extract<SourceDefinition, { kind: "type" }> = {
            ...this.createSourceDefinitionBase(node.range, node.selectionRange),
            kind: "type",
            name: this.resolveQName(node.name.qname, node.selectionRange),
        };
        this.declareDefinition(definition, this.document.offsetAt(node.range.end));
        return [this.createDeclarationNode(definition)];
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): AstNode[] {
        const definition: SourceFunctionDefinition = {
            ...this.createSourceDefinitionBase(node.range, node.selectionRange),
            kind: "function",
            name: this.resolveFunctionName(node.name, node.selectionRange),
            parameters: [],
            isPrivate: node.isPrivate,
        };
        this.validateLibraryExport(definition);
        this.declareDefinition(definition, this.document.offsetAt(node.selectionRange.end));

        const children = this.enterScope(node.range, () => [
            ...this.createFunctionParameterNodes(definition, node.parameters),
            ...this.visitChildrenAsNodes(node),
        ]);

        return [this.createDeclarationNode(definition, children)];
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): AstNode[] {
        const definition = this.createVariableDefinition(
            this.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
            node.isPrivate,
        );
        this.validateLibraryExport(definition);
        this.declareDefinition(definition, this.document.offsetAt(node.visibleFrom));
        const children = this.visitChildrenAsNodes(node);
        return [this.createDeclarationNode(definition, children)];
    }

    protected override visitFlowrExpression(node: FlowrExpressionAstNode): AstNode[] {
        return this.enterScope(node.range, () => this.visitChildrenAsNodes(node));
    }

    protected override visitCatchClause(node: CatchClauseAstNode): AstNode[] {
        return this.enterScope(node.range, () => {
            for (const name of CATCH_VARIABLES) {
                const definition: ImplicitVariableDefinition = {
                    kind: "variable",
                    name: this.resolveQName(name, node.range),
                    origin: "implicit",
                };
                this.declareDefinition(definition, this.document.offsetAt(node.bodyStart));
            }
            return this.visitChildrenAsNodes(node);
        });
    }

    protected override visitVariableReference(node: VariableReferenceAstNode): AstNode[] {
        return [
            this.createReference("variable", this.resolveQName(node.name, node.range), node.range),
        ];
    }

    protected override visitContextItemExpression(node: ContextItemExpressionAstNode): AstNode[] {
        return [
            this.createReference("variable", this.resolveQName(node.name, node.range), node.range),
        ];
    }

    protected override visitFunctionCall(node: FunctionCallAstNode): AstNode[] {
        return [this.createFunctionCallNode(node)];
    }

    protected override visitNamedFunctionReference(node: NamedFunctionReferenceAstNode): AstNode[] {
        return [this.createFunctionCallNode(node)];
    }

    protected override visitArgument(node: ArgumentAstNode): AstNode[] {
        return [
            this.adoptChildren<ArgumentNode>(
                {
                    kind: "argument",
                    range: node.range,
                    children: [],
                    index: node.index,
                },
                this.visitChildrenAsNodes(node),
            ),
        ];
    }

    protected override visitTypeReference(node: TypeReferenceAstNode): AstNode[] {
        return [this.createReference("type", this.resolveQName(node.name, node.range), node.range)];
    }

    private visitChildrenAsNodes(node: ParserAstNode): AstNode[] {
        return this.visitChildren(node).flat();
    }

    private createFunctionCallNode(
        node: FunctionCallAstNode | NamedFunctionReferenceAstNode,
    ): FunctionCallNode {
        const name = this.resolveFunctionName(node.name, node.selectionRange);
        const reference = this.createReference("function", name, node.selectionRange);
        const children = [reference, ...this.visitChildrenAsNodes(node)];
        return this.adoptChildren<FunctionCallNode>(
            {
                kind: "function-call",
                range: node.range,
                children: [],
                name,
                selectionRange: node.selectionRange,
                reference,
                arguments: children.filter(
                    (child): child is ArgumentNode => child.kind === "argument",
                ),
            },
            children,
        );
    }

    private createDeclarationNode(
        declaration: SourceDefinition,
        children: AstNode[] = [],
    ): DeclarationNode {
        return this.adoptChildren<DeclarationNode>(
            {
                kind: "declaration",
                range: declaration.range,
                children: [],
                declaration,
            },
            children,
        );
    }

    private createSourceDefinitionBase(range: Range, selectionRange: Range) {
        return {
            uri: this.document.uri,
            range,
            selectionRange,
            origin: "source" as const,
        };
    }

    private createVariableDefinition(
        name: QName,
        range: Range,
        selectionRange: Range,
        isPrivate: boolean = false,
    ): SourceVariableDefinition {
        return {
            ...this.createSourceDefinitionBase(range, selectionRange),
            kind: "variable",
            name,
            isPrivate,
        };
    }

    private adoptChildren<T extends AstNode>(parent: T, children: AstNode[]): T {
        parent.children = children;
        for (const child of children) {
            child.parent = parent;
        }
        return parent;
    }

    private enterScope<T>(range: Range, callback: () => T): T {
        const previousScope = this.currentScope;
        this.currentScope = this.currentScope.enter(
            this.document.offsetAt(range.start),
            this.document.offsetAt(range.end),
        );
        try {
            return callback();
        } finally {
            this.currentScope = previousScope;
        }
    }

    private declareDefinition(definition: ScopeDefinition, visibleFrom: number): void {
        this.currentScope.declare(definition, visibleFrom);
        if (definition.origin === "source" && definition.uri === this.document.uri) {
            this.definitions.push(definition);
        }
    }

    private validateLibraryExport(
        definition: SourceFunctionDefinition | SourceVariableDefinition,
    ): void {
        if (this.moduleNamespaceUri === undefined || this.currentScope !== this.result.scope)
            return;
        const namespaceUri =
            definition.kind === "function"
                ? definition.name.qname.namespaceUri
                : definition.name.namespaceUri;
        if (namespaceUri === this.moduleNamespaceUri) return;
        this.result.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            code: "XQST0048",
            message: `A library module declaration must use namespace '${this.moduleNamespaceUri}'.`,
            range: definition.selectionRange,
        });
    }

    private resolve<K extends keyof ReferenceNameByKind>(
        kind: K,
        name: ReferenceNameByKind[K],
        offset: number,
    ): DefinitionByReferenceKind[K] | undefined {
        if (kind === "function") {
            const builtinDefinition = builtinFunctions.find(name as FunctionName);
            if (builtinDefinition !== undefined) {
                return builtinDefinition as DefinitionByReferenceKind[K];
            }
        }

        return this.currentScope.resolve(kind, name, offset);
    }

    private createReference<K extends keyof ReferenceNameByKind>(
        kind: K,
        name: ReferenceNameByKind[K],
        range: Range,
    ): ReferenceNode<K> {
        const lookupName = referenceNameToString(name, kind, true);
        const declaration = this.resolve(kind, name, this.document.offsetAt(range.start));
        const resolvedReference =
            declaration === undefined
                ? undefined
                : ({
                      kind,
                      name,
                      uri: this.document.uri,
                      range,
                      declaration,
                  } satisfies ResolvedReference<K>);

        if (declaration === undefined) {
            this.result.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                message: `Reference to undefined ${kind} '${lookupName}'`,
                range,
                code: `unresolved-${kind}`,
            });
        } else if (resolvedReference !== undefined) {
            this.recordReference(resolvedReference);
        }

        return {
            kind: "reference",
            range,
            children: [],
            referenceKind: kind,
            name,
            resolution: resolvedReference,
        };
    }

    private recordReference<K extends keyof ReferenceNameByKind>(
        reference: ResolvedReference<K>,
    ): void {
        // TypeScript cannot distribute a generic K into the mapped union even though
        // ResolvedReference<K> preserves the same kind/name/declaration relationship.
        const anyReference = reference as AnyResolvedReference;
        this.references.push(anyReference);

        const referencesToDefinition = this.referencesByDefinition.get(reference.declaration) ?? [];
        referencesToDefinition.push(anyReference);
        this.referencesByDefinition.set(reference.declaration, referencesToDefinition);
    }

    private createFunctionParameterNodes(
        definition: SourceFunctionDefinition,
        parameters: AstParameter[],
    ): DeclarationNode[] {
        return parameters.map((parameter) => {
            const parameterDefinition: SourceParameterDefinition = {
                ...this.createSourceDefinitionBase(parameter.range, parameter.selectionRange),
                kind: "parameter",
                name: this.resolveQName(parameter.name, parameter.selectionRange),
                function: definition,
            };
            this.declareDefinition(
                parameterDefinition,
                this.document.offsetAt(parameter.range.end),
            );
            definition.parameters.push(parameterDefinition);
            return this.createDeclarationNode(parameterDefinition);
        });
    }

    private resolveFunctionName(name: LexicalFunctionName, range: Range): FunctionName {
        return {
            ...name,
            qname: this.resolveQName(name.qname, range),
        };
    }

    private resolveQName(qname: LexicalQName, range: Range): QName {
        const namespaceUri = isUriQualifiedQName(qname)
            ? qname.namespaceUri
            : isPrefixedQName(qname)
              ? this.result.namespaces.get(qname.prefix)?.namespaceUri
              : undefined;

        if (namespaceUri === undefined && isPrefixedQName(qname)) {
            this.result.diagnostics.push({
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

export function buildAnalysis(
    document: TextDocument,
    moduleImports: readonly ResolvedModuleImport[] = [],
): AnalysisResult {
    return new AnalysisBuilder(document, moduleImports).build();
}

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
import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode-languageserver";
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
    createFunctionDefinition,
    createNamespaceDefinition,
    createParameterDefinition,
    createTypeDefinition,
    createVariableDefinition,
    Definition,
    isSourceDefinition,
    SourceDefinition,
    SourceFunctionDefinition,
    SourceModuleExportDefinition,
    SourceNamespaceDefinition,
} from "./definitions.js";
import {
    referenceNameToString,
    type FunctionName,
    type QName,
    type ReferenceNameByKind,
} from "./names.js";
import { ResolvedReference } from "./reference.js";
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
    namespaces: Map<Prefix, SourceNamespaceDefinition>;
    diagnostics: Diagnostic[];
}

/** Declarations made visible by a directly imported library module. */
export interface ResolvedModuleImport {
    readonly targetNamespaceUri: string;
    readonly exports: readonly SourceModuleExportDefinition[];
}

class AnalysisBuilder extends ParserAstVisitor<AstNode[]> {
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
        const namespaces = new Map<string, SourceNamespaceDefinition>(
            defaultNamespaces.entries().map((ns) => {
                const definition = createNamespaceDefinition(
                    document,
                    ns[0],
                    ns[1],
                    Range.create(Position.create(0, 0), Position.create(0, 0)),
                    Range.create(Position.create(0, 0), Position.create(0, 0)),
                );
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
        const definition = createNamespaceDefinition(
            this.document,
            node.prefix,
            node.namespaceUri,
            node.range,
            node.selectionRange,
        );
        this.declareDefinition(definition);
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
        const definition = createNamespaceDefinition(
            this.document,
            node.prefix,
            node.namespaceUri,
            node.range,
            node.selectionRange,
        );
        this.declareDefinition(definition);
        this.result.namespaces.set(definition.name.prefix, definition);
        // A library module declaration owns its prolog in the parser AST. Keep its
        // namespace declaration and visit that prolog so library functions and
        // variables participate in analysis.
        return [this.createDeclarationNode(definition), ...this.visitChildrenAsNodes(node)];
    }

    protected override visitModuleImport(node: ModuleImportAstNode): AstNode[] {
        const declarations: DeclarationNode[] = [];
        if (node.prefix !== undefined && node.prefixRange !== undefined) {
            const definition = createNamespaceDefinition(
                this.document,
                node.prefix,
                node.namespaceUri,
                node.range,
                node.prefixRange,
            );
            this.result.namespaces.set(node.prefix, definition);
            this.declareDefinition(definition, 0);
            declarations.push(this.createDeclarationNode(definition));
        }

        const resolvedImport = this.moduleImportsByNamespace.get(node.namespaceUri);
        for (const declaration of resolvedImport?.exports ?? []) {
            this.declareDefinition(declaration, 0);
        }
        return declarations;
    }

    protected override visitContextItemDeclaration(node: ContextItemDeclarationAstNode): AstNode[] {
        const definition = createVariableDefinition(
            this.document,
            this.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.declareDefinition(definition);
        return [this.createDeclarationNode(definition)];
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): AstNode[] {
        const definition = createTypeDefinition(
            this.document,
            this.resolveQName(node.name.qname, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.declareDefinition(definition);
        return [this.createDeclarationNode(definition)];
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): AstNode[] {
        const definition = createFunctionDefinition(
            this.document,
            this.resolveFunctionName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
            node.isPrivate,
        );
        this.validateLibraryExport(definition);
        this.declareDefinition(definition);

        const children = this.enterScope(node.range, () => [
            ...this.createFunctionParameterNodes(definition, node.parameters),
            ...this.visitChildrenAsNodes(node),
        ]);

        return [this.createDeclarationNode(definition, children)];
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): AstNode[] {
        const definition = createVariableDefinition(
            this.document,
            this.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
            this.document.offsetAt(node.visibleFrom),
            node.isPrivate,
        );
        this.validateLibraryExport(definition);
        this.declareDefinition(definition);
        const children = this.visitChildrenAsNodes(node);
        return [this.createDeclarationNode(definition, children)];
    }

    protected override visitFlowrExpression(node: FlowrExpressionAstNode): AstNode[] {
        return this.enterScope(node.range, () => this.visitChildrenAsNodes(node));
    }

    protected override visitCatchClause(node: CatchClauseAstNode): AstNode[] {
        return this.enterScope(node.range, () => {
            const declarations = CATCH_VARIABLES.map((name) => {
                const definition = createVariableDefinition(
                    this.document,
                    this.resolveQName(name, node.range),
                    node.range,
                    node.range,
                    this.document.offsetAt(node.range.start),
                );
                this.declareDefinition(definition);
                return this.createDeclarationNode(definition);
            });
            return [...declarations, ...this.visitChildrenAsNodes(node)];
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

    private declareDefinition(definition: SourceDefinition, visibleFrom?: number): void {
        this.currentScope.declare(definition, visibleFrom);
    }

    private validateLibraryExport(
        definition: SourceFunctionDefinition | Extract<SourceDefinition, { kind: "variable" }>,
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
    ): Definition | undefined {
        if (kind === "function") {
            const builtinDefinition = builtinFunctions.find(name as FunctionName);
            if (builtinDefinition !== undefined) {
                return builtinDefinition;
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
                  } as unknown as ResolvedReference<K>);

        if (declaration === undefined) {
            this.result.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                message: `Reference to undefined ${kind} '${lookupName}'`,
                range,
                code: `unresolved-${kind}`,
            });
        } else if (isSourceDefinition(declaration) && resolvedReference !== undefined) {
            declaration.references.push(resolvedReference);
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

    private createFunctionParameterNodes(
        definition: SourceFunctionDefinition,
        parameters: AstParameter[],
    ): DeclarationNode[] {
        return parameters.map((parameter) => {
            const parameterDefinition = createParameterDefinition(
                this.document,
                this.resolveQName(parameter.name, parameter.selectionRange),
                parameter.range,
                parameter.selectionRange,
                definition,
            );
            this.declareDefinition(parameterDefinition);
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

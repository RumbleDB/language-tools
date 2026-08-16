import type {
    ArgumentAstNode,
    AstNode as ParserAstNode,
    AstParameter,
    CatchErrorTargetAstNode,
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
import { ParserAstVisitor } from "server/parser/types/visitor.js";
import { builtinFunctions } from "server/resources/builtin-functions.js";
import { DiagnosticSeverity, type Diagnostic, type Range } from "vscode-languageserver";

import type {
    ArgumentNode,
    AstNode,
    DeclarationNode,
    ErrorCodeTargetNode,
    FunctionCallNode,
    ModuleNode,
    ReferenceNode,
} from "./ast.js";
import type {
    Definition,
    DefinitionByReferenceKind,
    ImplicitVariableDefinition,
    ScopeDefinition,
    SourceDefinition,
} from "./definitions.js";
import type { DocumentIndex } from "./document-index.js";
import { NamespaceResolver } from "./name-resolution.js";
import { referenceNameToString, type FunctionName, type ReferenceNameByKind } from "./names.js";
import type { AnyResolvedReference, ResolvedReference } from "./reference.js";
import type { AnalysisEnvironment, AnalysisResult, ResolvedModuleImport } from "./result.js";
import { ScopeBuilder } from "./scope.js";

const CATCH_VARIABLES = [
    { kind: "prefixed-qname", prefix: "err", localName: "code" },
    { kind: "prefixed-qname", prefix: "err", localName: "description" },
    { kind: "prefixed-qname", prefix: "err", localName: "value" },
    { kind: "prefixed-qname", prefix: "err", localName: "module" },
    { kind: "prefixed-qname", prefix: "err", localName: "line-number" },
    { kind: "prefixed-qname", prefix: "err", localName: "column-number" },
    { kind: "prefixed-qname", prefix: "err", localName: "additional" },
] as const;

class AnalysisBuilder extends ParserAstVisitor<AstNode[]> {
    private readonly moduleScope: ScopeBuilder;
    private currentScope: ScopeBuilder;
    private readonly index: DocumentIndex;
    private readonly resolvedImportsByNamespace: ReadonlyMap<string, ResolvedModuleImport>;
    private readonly diagnostics: Diagnostic[];
    private readonly references: AnyResolvedReference[] = [];
    private readonly referencesByDefinition = new Map<Definition, AnyResolvedReference[]>();
    private readonly nameResolver: NamespaceResolver;

    /** Definitions temporarily hidden while resolving a Prolog variable initializer. */
    private readonly excludedDefinitions = new Set<ScopeDefinition>();

    public constructor(index: DocumentIndex, environment: AnalysisEnvironment) {
        super();
        this.index = index;
        this.resolvedImportsByNamespace = new Map(
            (environment.resolvedImports ?? []).map((moduleImport) => [
                moduleImport.targetNamespaceUri,
                moduleImport,
            ]),
        );
        this.diagnostics = [...(environment.diagnostics ?? []), ...index.diagnostics];
        this.moduleScope = ScopeBuilder.module(index.document.getText().length);
        this.currentScope = this.moduleScope;
        this.nameResolver = new NamespaceResolver(index.namespaces, (diagnostic) =>
            this.diagnostics.push(diagnostic),
        );
    }

    public build(): AnalysisResult {
        this.declareModuleEnvironment();
        const ast: ModuleNode = {
            kind: "module",
            range: this.index.ast.range,
            children: this.visitChildrenAsNodes(this.index.ast),
        };

        return {
            ast,
            moduleDeclaration: this.index.moduleDeclaration,
            ...(this.index.moduleInterface === undefined
                ? {}
                : { moduleInterface: this.index.moduleInterface }),
            scope: this.moduleScope,
            namespaces: this.index.namespaces,
            definitions: this.index.definitions,
            references: this.references,
            referencesByDefinition: this.referencesByDefinition,
            diagnostics: this.diagnostics,
        };
    }

    protected override defaultVisit(node: ParserAstNode): AstNode[] {
        return this.visitChildrenAsNodes(node);
    }

    protected override visitNamespaceDeclaration(node: NamespaceDeclarationAstNode): AstNode[] {
        return [
            this.createDeclarationNode(
                this.requireIndexed(this.index.indexedDefinitions.namespaces, node),
            ),
        ];
    }

    protected override visitModuleDeclaration(node: ModuleDeclarationAstNode): AstNode[] {
        // A library module declaration owns its prolog in the parser AST. Keep its
        // namespace declaration and visit that prolog so library functions and
        // variables participate in analysis.
        return [
            this.createDeclarationNode(
                this.requireIndexed(this.index.indexedDefinitions.namespaces, node),
            ),
            ...this.visitChildrenAsNodes(node),
        ];
    }

    protected override visitModuleImport(node: ModuleImportAstNode): AstNode[] {
        if (node.prefix === undefined || node.prefixRange === undefined) {
            return [];
        }

        return [
            this.createDeclarationNode(
                this.requireIndexed(this.index.indexedDefinitions.namespaces, node),
            ),
        ];
    }

    protected override visitContextItemDeclaration(node: ContextItemDeclarationAstNode): AstNode[] {
        const definition = this.requireIndexed(this.index.indexedDefinitions.contextItems, node);
        this.currentScope.declare(definition, this.index.document.offsetAt(node.range.end));
        return [this.createDeclarationNode(definition)];
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): AstNode[] {
        const definition = this.requireIndexed(this.index.indexedDefinitions.types, node);
        this.currentScope.declare(definition, this.index.document.offsetAt(node.range.end));
        return [this.createDeclarationNode(definition)];
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): AstNode[] {
        const definition = this.requireIndexed(this.index.indexedDefinitions.functions, node);

        const children = this.enterScope(node.range, () => [
            ...this.createFunctionParameterNodes(node.parameters),
            ...this.visitChildrenAsNodes(node),
        ]);

        return [this.createDeclarationNode(definition, children)];
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): AstNode[] {
        const definition = this.requireIndexed(this.index.indexedDefinitions.variables, node);
        const isPrologDeclaration = this.index.prologDeclarations.has(node);
        if (!isPrologDeclaration) {
            this.currentScope.declare(definition, this.index.document.offsetAt(node.visibleFrom));
        }
        const children = isPrologDeclaration
            ? this.withExcludedDefinition(definition, () => this.visitChildrenAsNodes(node))
            : this.visitChildrenAsNodes(node);
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
                    name: this.nameResolver.resolveQName(name, node.range),
                    origin: "implicit",
                };
                this.currentScope.declare(definition, this.index.document.offsetAt(node.bodyStart));
            }
            return this.visitChildrenAsNodes(node);
        });
    }

    protected override visitCatchErrorTarget(node: CatchErrorTargetAstNode): AstNode[] {
        if (node.target.kind === "wildcard") {
            return [
                {
                    kind: "error-code-target",
                    range: node.range,
                    children: [],
                    target: node.target,
                },
            ];
        }

        const name = this.nameResolver.resolveQName(node.target.name, node.range);
        return [
            {
                kind: "error-code-target",
                range: node.range,
                children: [],
                target: { kind: "exact", name },
            } satisfies ErrorCodeTargetNode,
        ];
    }

    protected override visitVariableReference(node: VariableReferenceAstNode): AstNode[] {
        return [this.createVariableReferenceNode(node)];
    }

    protected override visitContextItemExpression(node: ContextItemExpressionAstNode): AstNode[] {
        return [this.createVariableReferenceNode(node)];
    }

    protected override visitFunctionCall(node: FunctionCallAstNode): AstNode[] {
        return [this.createFunctionCallNode(node)];
    }

    protected override visitNamedFunctionReference(node: NamedFunctionReferenceAstNode): AstNode[] {
        return [this.createFunctionCallNode(node)];
    }

    protected override visitArgument(node: ArgumentAstNode): AstNode[] {
        const children = this.visitChildrenAsNodes(node);
        return [
            {
                kind: "argument",
                range: node.range,
                children,
                index: node.index,
            },
        ];
    }

    protected override visitTypeReference(node: TypeReferenceAstNode): AstNode[] {
        return [
            this.createReference(
                "type",
                this.nameResolver.resolveQName(node.name, node.range),
                node.range,
            ),
        ];
    }

    private visitChildrenAsNodes(node: ParserAstNode): AstNode[] {
        return this.visitChildren(node).flat();
    }

    private createVariableReferenceNode(
        node: VariableReferenceAstNode | ContextItemExpressionAstNode,
    ): ReferenceNode<"variable"> {
        return this.createReference(
            "variable",
            this.nameResolver.resolveQName(node.name, node.range),
            node.range,
        );
    }

    private createFunctionCallNode(
        node: FunctionCallAstNode | NamedFunctionReferenceAstNode,
    ): FunctionCallNode {
        const name = this.nameResolver.resolveFunctionName(node.name, node.selectionRange);
        const reference = this.createReference("function", name, node.selectionRange);
        const children = [reference, ...this.visitChildrenAsNodes(node)];
        return {
            kind: "function-call",
            range: node.range,
            children,
            name,
            selectionRange: node.selectionRange,
            reference,
            arguments: children.filter((child): child is ArgumentNode => child.kind === "argument"),
        };
    }

    private createDeclarationNode(
        declaration: SourceDefinition,
        children: AstNode[] = [],
    ): DeclarationNode {
        return {
            kind: "declaration",
            range: declaration.range,
            children,
            declaration,
        };
    }

    private enterScope<T>(range: Range, callback: () => T): T {
        const previousScope = this.currentScope;
        this.currentScope = this.currentScope.enter(
            this.index.document.offsetAt(range.start),
            this.index.document.offsetAt(range.end),
        );
        try {
            return callback();
        } finally {
            this.currentScope = previousScope;
        }
    }

    private requireIndexed<K, V>(definitions: ReadonlyMap<K, V>, node: K): V {
        const definition = definitions.get(node);
        if (definition !== undefined) return definition;
        const nodeKind =
            typeof node === "object" && node !== null && "kind" in node
                ? ` for '${String(node.kind)}' node`
                : "";
        throw new Error(`Missing indexed definition${nodeKind}.`);
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

        return this.currentScope.resolve(kind, name, offset, this.excludedDefinitions);
    }

    private createReference<K extends keyof ReferenceNameByKind>(
        kind: K,
        name: ReferenceNameByKind[K],
        range: Range,
    ): ReferenceNode<K> {
        const declaration = this.resolve(kind, name, this.index.document.offsetAt(range.start));
        if (declaration === undefined) {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                message: `Reference to undefined ${kind} '${referenceNameToString(name, kind, true)}'`,
                range,
                code: `unresolved-${kind}`,
            });
            return {
                kind: "reference",
                range,
                children: [],
                referenceKind: kind,
                name,
                resolution: undefined,
            };
        }

        const resolvedReference = {
            kind,
            name,
            uri: this.index.document.uri,
            range,
            declaration,
        } satisfies ResolvedReference<K>;
        this.recordReference(resolvedReference);

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

    private createFunctionParameterNodes(parameters: AstParameter[]): DeclarationNode[] {
        return parameters.map((parameter) => {
            const parameterDefinition = this.requireIndexed(
                this.index.indexedDefinitions.parameters,
                parameter,
            );
            this.currentScope.declare(
                parameterDefinition,
                this.index.document.offsetAt(parameter.range.end),
            );
            return this.createDeclarationNode(parameterDefinition);
        });
    }

    private declareModuleEnvironment(): void {
        this.declareImportedDefinitions();
        this.declarePrologDefinitions();
    }

    private declareImportedDefinitions(): void {
        for (const moduleImport of this.index.moduleDeclaration.imports) {
            const resolvedImport = this.resolvedImportsByNamespace.get(moduleImport.namespaceUri);
            for (const definition of resolvedImport?.exports.values() ?? []) {
                this.moduleScope.declare(definition, 0);
            }
        }
    }

    private declarePrologDefinitions(): void {
        for (const node of this.index.prologDeclarations) {
            const definition =
                node.kind === "function-declaration"
                    ? this.requireIndexed(this.index.indexedDefinitions.functions, node)
                    : this.requireIndexed(this.index.indexedDefinitions.variables, node);
            this.moduleScope.declare(definition, 0);
        }
    }

    private withExcludedDefinition<T>(definition: ScopeDefinition, callback: () => T): T {
        this.excludedDefinitions.add(definition);
        try {
            return callback();
        } finally {
            this.excludedDefinitions.delete(definition);
        }
    }
}

export function analyzeDocument(
    index: DocumentIndex,
    environment: AnalysisEnvironment = {},
): AnalysisResult {
    return new AnalysisBuilder(index, environment).build();
}

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
import {
    isPrefixedQName,
    isUriQualifiedQName,
    Prefix,
    type LexicalFunctionName,
    type LexicalQName,
} from "server/parser/types/name.js";
import { ParserAstVisitor } from "server/parser/types/visitor.js";
import { builtinFunctions } from "server/resources/builtin-functions.js";
import { Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver";

import type {
    ArgumentNode,
    AstNode,
    DeclarationNode,
    ErrorCodeTargetNode,
    FunctionCallNode,
    ModuleNode,
    ReferenceNode,
} from "./ast.js";
import {
    Definition,
    DefinitionByReferenceKind,
    ImplicitVariableDefinition,
    NamespaceDefinition,
    ScopeDefinition,
    SourceDefinition,
    SourceModuleExportDefinition,
} from "./definitions.js";
import type { DocumentIndex } from "./document-index.js";
import type { ModuleDeclaration, ModuleInterface } from "./module-info.js";
import {
    referenceNameToString,
    type FunctionName,
    type QName,
    type ReferenceNameByKind,
} from "./names.js";
import { AnyResolvedReference, ResolvedReference } from "./reference.js";
import { ScopeBuilder, type Scope } from "./scope.js";

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
    /**
     * Root AST node for the module
     */
    ast: ModuleNode;

    /**
     * Module declaration of current module, either main or library
     */
    readonly moduleDeclaration: ModuleDeclaration;

    /**
     * Module interface of current module, if it is a library module
     */
    readonly moduleInterface?: ModuleInterface;

    /**
     * Root scope of the module
     */
    readonly scope: Scope;

    /**
     * Map of namespace prefix to namespace definition for all namespaces declared in the module
     */
    readonly namespaces: ReadonlyMap<Prefix, NamespaceDefinition>;

    /**
     * List of all definitions declared in the module
     */
    readonly definitions: readonly SourceDefinition[];

    /**
     * List of all resolved references in the module
     */
    readonly references: AnyResolvedReference[];

    /**
     * Map from definition to all resolved references to that definition in the module
     */
    readonly referencesByDefinition: Map<Definition, AnyResolvedReference[]>;

    /**
     * List of all diagnostics reported during analysis of the module
     */
    readonly diagnostics: Diagnostic[];
}

/** Declarations made visible by a directly imported library module. */
export interface ResolvedModuleImport {
    readonly targetNamespaceUri: string;
    readonly exports: ReadonlyMap<string, SourceModuleExportDefinition>;
}

export interface AnalysisEnvironment {
    readonly resolvedImports?: readonly ResolvedModuleImport[];
    readonly diagnostics?: readonly Diagnostic[];
}

class AnalysisBuilder extends ParserAstVisitor<AstNode[]> {
    private readonly result: AnalysisResult;

    private currentScope: ScopeBuilder;

    private readonly index: DocumentIndex;

    private readonly resolvedImportsByNamespace: ReadonlyMap<string, ResolvedModuleImport>;

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
        const moduleScope = ScopeBuilder.module(index.document.getText().length);

        this.result = {
            ast: {
                kind: "module",
                range: index.ast.range,
                children: [],
            },
            moduleDeclaration: index.moduleDeclaration,
            ...(index.moduleInterface === undefined
                ? {}
                : { moduleInterface: index.moduleInterface }),
            scope: moduleScope,
            namespaces: index.namespaces,
            definitions: index.definitions,
            references: [],
            referencesByDefinition: new Map(),
            diagnostics: [...(environment.diagnostics ?? []), ...index.diagnostics],
        };

        this.currentScope = moduleScope;
    }

    public build(): AnalysisResult {
        this.declarePrologDeclarations();
        this.result.ast = this.adoptChildren(
            this.result.ast,
            this.visitChildrenAsNodes(this.index.ast),
        );
        return this.result;
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
        const declarations: DeclarationNode[] = [];
        if (node.prefix !== undefined && node.prefixRange !== undefined) {
            declarations.push(
                this.createDeclarationNode(
                    this.requireIndexed(this.index.indexedDefinitions.namespaces, node),
                ),
            );
        }

        const resolvedImport = this.resolvedImportsByNamespace.get(node.namespaceUri);
        for (const declaration of resolvedImport?.exports.values() ?? []) {
            this.currentScope.declare(declaration, 0);
        }
        return declarations;
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
                    name: this.resolveQName(name, node.range),
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

        const name = this.resolveQName(node.target.name, node.range);
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
        return { ...parent, children };
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
        throw new Error(`Missing indexed definition`);
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
        const lookupName = referenceNameToString(name, kind, true);
        const declaration = this.resolve(kind, name, this.index.document.offsetAt(range.start));
        const resolvedReference =
            declaration === undefined
                ? undefined
                : ({
                      kind,
                      name,
                      uri: this.index.document.uri,
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
        this.result.references.push(anyReference);

        const referencesToDefinition =
            this.result.referencesByDefinition.get(reference.declaration) ?? [];
        referencesToDefinition.push(anyReference);
        this.result.referencesByDefinition.set(reference.declaration, referencesToDefinition);
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

    private declarePrologDeclarations(): void {
        for (const node of this.index.prologDeclarations) {
            const definition =
                node.kind === "function-declaration"
                    ? this.requireIndexed(this.index.indexedDefinitions.functions, node)
                    : this.requireIndexed(this.index.indexedDefinitions.variables, node);
            this.currentScope.declare(definition, 0);
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

export function analyzeDocument(
    index: DocumentIndex,
    environment: AnalysisEnvironment = {},
): AnalysisResult {
    return new AnalysisBuilder(index, environment).build();
}

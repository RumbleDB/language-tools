import {
    AbstractParseTreeVisitor,
    type ParseTree,
    type ParserRuleContext,
    type TerminalNode,
} from "antlr4ng";
import type * as ctx from "server/parser/context.js";
import {
    parseArrowFunctionName,
    parseFunctionName,
    parseVarName,
} from "server/parser/shared/name.js";
import {
    CONTEXT_ITEM_NAME,
    parseQNameText,
    type LexicalFunctionName,
    type Prefix,
} from "server/parser/types/name.js";
import { rangeFromNode } from "server/utils/range.js";
import {
    DiagnosticSeverity,
    type Diagnostic,
    type Position,
    type Range,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type {
    ArgumentNode,
    AstNode,
    DeclarationNode,
    ErrorCodeTargetNode,
    FunctionCallNode,
    ModuleNode,
    ReferenceNode,
} from "./model/ast.js";
import { STANDARD_CATCH_VARIABLES } from "./model/constants.js";
import type {
    DefinitionByReferenceKind,
    ImplicitVariableDefinition,
    ScopeDefinition,
    SourceDefinition,
    SourceNamespaceDefinition,
    SourceVariableDefinition,
} from "./model/definitions.js";
import { referenceNameToString, type ReferenceNameByKind } from "./model/names.js";
import type { ResolvedReference } from "./model/reference.js";
import type { AnalysisEnvironment, AnalysisResult, ResolvedModuleImport } from "./model/result.js";
import { ScopeBuilder } from "./model/scope.js";
import { SourceDefinitionFactory } from "./resolution/definition-factory.js";
import {
    collectModuleProlog,
    type ModuleProlog,
    type ModulePrologDeclarations,
} from "./resolution/module-prolog.js";
import { NamespaceResolver } from "./resolution/name-resolution.js";

/** A variable a node binds, with the position its scope starts from, or null when it binds none. */
type VariableBinding = [
    binding: ctx.VarBindingContext | null | undefined,
    visibleFrom: Position | null,
];

/**
 * Builds the semantic AST of a module from its parse tree, declaring each variable in its scope and resolving each
 * reference as it goes. The parsers of both languages dispatch a node to the visit method of its rule by name, so one
 * visitor serves both. A rule without a visit method contributes the nodes of its children.
 */
class AnalysisBuilder extends AbstractParseTreeVisitor<AstNode[]> {
    private readonly moduleScope: ScopeBuilder;
    private currentScope: ScopeBuilder;
    private readonly definitions: SourceDefinitionFactory;
    private readonly namespaces: ReadonlyMap<Prefix, SourceNamespaceDefinition>;
    private readonly defaultElementTypeNamespace: string | undefined;
    private readonly defaultFunctionNamespace: string | undefined;
    private readonly declarations: ModulePrologDeclarations;
    private readonly resolvedImportsByNamespace: ReadonlyMap<string, ResolvedModuleImport>;
    private readonly diagnostics: Diagnostic[];
    private readonly nameResolver: NamespaceResolver;
    private readonly resolveBuiltin: NonNullable<AnalysisEnvironment["resolveBuiltin"]>;

    /** Definitions temporarily hidden while resolving a Prolog variable initializer. */
    private readonly excludedDefinitions = new Set<ScopeDefinition>();

    public constructor(
        private readonly document: TextDocument,
        private readonly tree: ctx.ModuleAndThisIsItContext,
        environment: AnalysisEnvironment,
    ) {
        super();
        const prolog: ModuleProlog = environment.prolog ?? collectModuleProlog(document, tree);

        this.definitions = prolog.definitions;
        this.namespaces = prolog.namespaces;
        this.defaultElementTypeNamespace = prolog.defaultElementTypeNamespace;
        this.defaultFunctionNamespace = prolog.defaultFunctionNamespace;
        this.declarations = prolog.declarations;
        this.diagnostics = [...prolog.diagnostics];
        this.resolveBuiltin = environment.resolveBuiltin ?? ((_kind, _name) => undefined);

        this.resolvedImportsByNamespace = new Map(
            (environment.resolvedImports ?? []).map((moduleImport) => [
                moduleImport.targetNamespaceUri,
                moduleImport,
            ]),
        );
        this.moduleScope = ScopeBuilder.module(document.getText().length);
        for (const definition of environment.schemaConstructors ?? []) {
            this.moduleScope.declare(definition, 0);
        }
        for (const definition of environment.schemaTypes ?? []) {
            this.moduleScope.declare(definition, 0);
        }
        this.currentScope = this.moduleScope;
        this.nameResolver = new NamespaceResolver(
            this.namespaces,
            (diagnostic) => this.diagnostics.push(diagnostic),
            this.defaultElementTypeNamespace,
        );
    }

    public build(): AnalysisResult {
        this.declareModuleEnvironment();
        const ast: ModuleNode = {
            kind: "module",
            range: this.range(this.tree),
            children: this.visitChildren(this.tree),
        };

        return {
            ast,
            scope: this.moduleScope,
            namespaces: this.nameResolver.getNamespaces(),
            defaultElementTypeNamespace: this.defaultElementTypeNamespace,
            defaultFunctionNamespace: this.defaultFunctionNamespace,
            diagnostics: this.diagnostics,
        };
    }

    protected override defaultResult(): AstNode[] {
        return [];
    }

    protected override aggregateResult(aggregate: AstNode[], nextResult: AstNode[]): AstNode[] {
        return aggregate.concat(nextResult);
    }

    public override visit(tree: ParseTree | null | undefined): AstNode[] {
        return tree == null ? [] : (super.visit(tree) ?? []);
    }

    public override visitChildren(node: ParseTree): AstNode[] {
        return super.visitChildren(node) ?? [];
    }

    // Prolog declarations, whose definitions the prolog collector made.

    /** A library module declaration, which owns the prolog after it. */
    public visitLibraryModule(node: ctx.LibraryModuleContext): AstNode[] {
        return [...this.namespaceDeclaration(node), ...this.visitChildren(node)];
    }

    public visitModuleImport(node: ctx.ModuleImportContext): AstNode[] {
        return this.namespaceDeclaration(node);
    }

    public visitSchemaImport(node: ctx.SchemaImportContext): AstNode[] {
        return this.namespaceDeclaration(node);
    }

    public visitNamespaceDecl(node: ctx.NamespaceDeclContext): AstNode[] {
        return this.namespaceDeclaration(node);
    }

    public visitDefaultNamespaceDecl(): AstNode[] {
        return [];
    }

    public visitBaseURIDecl(): AstNode[] {
        return [];
    }

    public visitContextItemDecl(node: ctx.ContextItemDeclContext): AstNode[] {
        const range = this.range(node);
        const selectionRange = {
            start: this.range(node.KW_CONTEXT()).start,
            end: this.range(node.KW_ITEM()).end,
        };
        const definition = this.definitions.variable(
            this.nameResolver.resolveQName(CONTEXT_ITEM_NAME, selectionRange),
            range,
            selectionRange,
        );
        this.currentScope.declare(definition, this.document.offsetAt(range.end));
        return [this.createDeclarationNode(definition)];
    }

    public visitTypeDecl(node: ctx.TypeDeclContext): AstNode[] {
        const definition = this.declarations.types.get(node);
        return definition === undefined ? [] : [this.createDeclarationNode(definition)];
    }

    public visitFunctionDecl(node: ctx.FunctionDeclContext): AstNode[] {
        const definition = this.declarations.functions.get(node)!;
        const children = this.enterScope(this.range(node), () => [
            ...definition.parameters.map((parameter) => {
                this.currentScope.declare(parameter, this.document.offsetAt(parameter.range.end));
                return this.createDeclarationNode(parameter);
            }),
            ...this.visitChildrenWithFocus(node, [node._fn_body]),
        ]);
        return [this.createDeclarationNode(definition, children)];
    }

    public visitVarDecl(node: ctx.VarDeclContext): AstNode[] {
        const definition = this.declarations.variables.get(node);
        if (definition === undefined) return this.visitChildren(node);

        // The initializer cannot refer to the variable it initializes.
        const children = this.withExcludedDefinition(definition, () => this.visitChildren(node));
        return [this.createDeclarationNode(definition, children)];
    }

    // Variable bindings.

    public visitForVar(node: ctx.ForVarContext): AstNode[] {
        const visibleFrom = this.endOf(node._ex);
        return this.declarationsBeforeChildren(node, [
            [node._var_ref, visibleFrom],
            [node._at, visibleFrom],
        ]);
    }

    public visitLetVar(node: ctx.LetVarContext): AstNode[] {
        return this.declarationWithChildren(node, [node._var_ref, this.endOf(node._ex)]);
    }

    public visitTumblingWindowClause(node: ctx.TumblingWindowClauseContext): AstNode[] {
        return this.declarationsBeforeChildren(node, [[node._name, this.range(node).end]]);
    }

    public visitSlidingWindowClause(node: ctx.SlidingWindowClauseContext): AstNode[] {
        return this.declarationsBeforeChildren(node, [[node._name, this.range(node).end]]);
    }

    public visitWindowStartCondition(node: ctx.WindowStartConditionContext): AstNode[] {
        return this.visitWindowCondition(node);
    }

    public visitWindowEndCondition(node: ctx.WindowEndConditionContext): AstNode[] {
        return this.visitWindowCondition(node);
    }

    private visitWindowCondition(
        node: ctx.WindowStartConditionContext | ctx.WindowEndConditionContext,
    ): AstNode[] {
        const variables = node.windowVars();
        const expression = node.exprSingle();
        const visibleFrom = this.startOf(expression);
        return [
            ...this.declareVariables([
                [variables?._currentItem, visibleFrom],
                [variables?._previousItem, visibleFrom],
                [variables?._nextItem, visibleFrom],
                [variables?.positionalVar()?._pvar, visibleFrom],
            ]),
            ...this.visit(expression),
        ];
    }

    public visitCountClause(node: ctx.CountClauseContext): AstNode[] {
        return this.declarationsBeforeChildren(node, [[node.varBinding(), this.range(node).end]]);
    }

    public visitGroupByClause(node: ctx.GroupByClauseContext): AstNode[] {
        const visibleFrom = this.range(node).end;
        return node
            .groupByVar()
            .flatMap((variable) =>
                this.declarationsBeforeChildren(variable, [[variable._var_ref, visibleFrom]]),
            );
    }

    public visitQuantifiedExprVar(node: ctx.QuantifiedExprVarContext): AstNode[] {
        return this.declarationsBeforeChildren(node, [
            [node._var_ref, this.endOf(node.exprSingle())],
        ]);
    }

    public visitTypeswitchExpr(node: ctx.TypeswitchExprContext): AstNode[] {
        return this.declarationsBeforeChildren(node, [[node._var_ref, this.startOf(node._def)]]);
    }

    public visitCaseClause(node: ctx.CaseClauseContext): AstNode[] {
        return this.declarationsBeforeChildren(node, [[node._var_ref, this.startOf(node._ret)]]);
    }

    public visitTypeSwitchStatement(node: ctx.TypeSwitchStatementContext): AstNode[] {
        return this.declarationsBeforeChildren(node, [[node._var_ref, this.startOf(node._def)]]);
    }

    public visitCaseStatement(node: ctx.CaseStatementContext): AstNode[] {
        return this.declarationsBeforeChildren(node, [[node._var_ref, this.startOf(node._ret)]]);
    }

    public visitInlineFunctionExpr(node: ctx.InlineFunctionExprContext): AstNode[] {
        const visibleFrom = this.endOf(node.LBRACE());
        const parameters = node.paramList()?.param() ?? [];
        return this.declarationsBeforeChildren(
            node,
            parameters.map((parameter): VariableBinding => [parameter._name, visibleFrom]),
            () => this.visitChildrenWithFocus(node, [node._fn_body]),
        );
    }

    public visitVarDeclStatement(node: ctx.VarDeclStatementContext): AstNode[] {
        const terminator = node.SEMICOLON();
        const visibleFrom =
            terminator === null || terminator.symbol.tokenIndex < 0
                ? null
                : this.range(terminator).end;
        return [
            ...this.visit(node.annotations()),
            ...node
                .varDeclForStatement()
                .flatMap((variable) =>
                    this.declarationsBeforeChildren(variable, [[variable._var_ref, visibleFrom]]),
                ),
        ];
    }

    public visitTransformExpr(node: ctx.TransformExprContext): AstNode[] {
        const visibleFrom = this.startOf(node._mod_expr);
        return [
            ...node
                .copyDecl()
                .flatMap((copy) =>
                    this.declarationsBeforeChildren(copy, [[copy._var_ref, visibleFrom]]),
                ),
            ...this.visit(node._mod_expr),
            ...this.visit(node._ret_expr),
        ];
    }

    // Scopes.

    public visitFlworExpr(node: ctx.FlworExprContext): AstNode[] {
        return this.enterScope(this.range(node), () => this.visitChildren(node));
    }

    public visitFlworStatement(node: ctx.FlworStatementContext): AstNode[] {
        return this.enterScope(this.range(node), () => this.visitChildren(node));
    }

    public visitQuantifiedExpr(node: ctx.QuantifiedExprContext): AstNode[] {
        return this.enterScope(this.range(node), () => this.visitChildren(node));
    }

    public visitCatchClause(node: ctx.CatchClauseContext): AstNode[] {
        return this.visitCatch(node, node.LBRACE(), node._catch_expression);
    }

    public visitCatchCaseStatement(node: ctx.CatchCaseStatementContext): AstNode[] {
        return this.visitCatch(node, node._catch_block?.LBRACE(), node._catch_block);
    }

    /** A catch clause, whose body sees the error variables, such as `$err:code`. */
    private visitCatch(
        node: ctx.CatchClauseContext | ctx.CatchCaseStatementContext,
        bodyStart: TerminalNode | null | undefined,
        body: ParseTree | null | undefined,
    ): AstNode[] {
        const range = this.range(node);
        const visibleFrom = this.document.offsetAt(this.endOf(bodyStart) ?? range.start);
        return this.enterScope(range, () => {
            for (const name of STANDARD_CATCH_VARIABLES) {
                const definition: ImplicitVariableDefinition = {
                    kind: "variable",
                    name: this.nameResolver.resolveQName(name, range),
                    origin: "implicit",
                };
                this.currentScope.declare(definition, visibleFrom);
            }
            return [
                ...node.nameTest().map((target) => this.createErrorCodeTarget(target)),
                ...this.visit(body),
            ];
        });
    }

    /** A predicate filters with each item as the context item. */
    public visitPredicate(node: ctx.PredicateContext): AstNode[] {
        return this.withFocus(node, () => this.visitChildren(node));
    }

    public visitSimpleMapExpr(node: ctx.SimpleMapExprContext): AstNode[] {
        return this.visitChildrenWithFocus(node, node._map_expr);
    }

    /** A leading slash evaluates the path from the root of the context item's tree. */
    public visitPathExpr(node: ctx.PathExprContext): AstNode[] {
        return this.visitChildrenWithFocus(node, [node._singleslash, node._doubleslash]);
    }

    public visitRelativePathExpr(node: ctx.RelativePathExprContext): AstNode[] {
        return this.visitChildrenWithFocus(node, node.stepExpr().slice(1));
    }

    // References.

    public visitVarRef(node: ctx.VarRefContext): AstNode[] {
        const name = parseVarName(node);
        if (name === null) return [];

        const range = this.range(node);
        return [
            this.createReference("variable", this.nameResolver.resolveQName(name, range), range),
        ];
    }

    public visitContextItemExpr(node: ctx.ContextItemExprContext): AstNode[] {
        const range = this.range(node);
        return [
            this.createReference(
                "variable",
                this.nameResolver.resolveQName(CONTEXT_ITEM_NAME, range),
                range,
                // Without a declaration, the context item is supplied when the query runs.
                false,
            ),
        ];
    }

    public visitItemType(node: ctx.ItemTypeContext): AstNode[] {
        const nameNode = node.eqName();
        if (nameNode === null) return this.visitChildren(node);

        const range = this.range(nameNode);
        const name = this.nameResolver.resolveTypeName(parseQNameText(nameNode.getText()), range);
        return [this.createReference("type", name, range)];
    }

    public visitFunctionCall(node: ctx.FunctionCallContext): AstNode[] {
        const nameNode = node._fn_name;
        if (nameNode === undefined) return [];

        const name = parseFunctionName(node, node.argumentList()?.argument().length);
        return [
            this.createFunctionCall(name, this.range(nameNode), this.range(node), () =>
                this.visitChildren(node),
            ),
        ];
    }

    public visitNamedFunctionRef(node: ctx.NamedFunctionRefContext): AstNode[] {
        const nameNode = node._fn_name;
        if (nameNode === undefined) return [];

        const arity = Number.parseInt(
            node._arity?.text ?? node.IntegerLiteral()?.getText() ?? "",
            10,
        );
        const name = parseFunctionName(node, Number.isNaN(arity) ? undefined : arity);
        return [this.createFunctionCall(name, this.range(nameNode), this.range(node), () => [])];
    }

    public visitArgumentList(node: ctx.ArgumentListContext): AstNode[] {
        return node.argument().map((argument, index) => this.createArgument(argument, index));
    }

    /**
     * Desugars each arrow step as XQuery 3.1 §3.16 defines it: `U => F(A, B)` is `F(U, A, B)`.
     * A named step becomes a call whose first argument is the operand, so `F` resolves with
     * arity N+1 and the steps of a chain nest left to right. A dynamic step (`$f` or `(expr)`)
     * names no function, so its parts stay plain expressions.
     */
    public visitArrowExpr(node: ctx.ArrowExprContext): AstNode[] {
        const operand = node._main_expr;
        const specifiers = node.arrowFunctionSpecifier();
        if (operand === undefined || specifiers.length === 0) {
            return this.visitChildren(node);
        }

        const argumentLists = node.argumentList();
        let result = this.visit(operand);
        let range = this.range(operand);

        for (const [index, specifier] of specifiers.entries()) {
            // Each specifier has its argument list, even an empty one that error recovery left.
            const argumentList = argumentLists[index];
            const explicitArguments = argumentList?.argument() ?? [];
            const stepRange = {
                start: range.start,
                end: this.range(argumentList ?? specifier).end,
            };

            const nameNode = specifier.eqName();
            const name = parseArrowFunctionName(
                specifier,
                argumentList === undefined ? undefined : explicitArguments.length,
            );
            if (nameNode === null || name === null) {
                result = [
                    ...result,
                    ...this.visit(specifier),
                    ...explicitArguments.flatMap((argument) => this.visitChildren(argument)),
                ];
            } else {
                const piped: ArgumentNode = {
                    kind: "argument",
                    range,
                    children: result,
                    index: 0,
                    piped: true,
                };
                result = [
                    this.createFunctionCall(
                        name,
                        this.range(nameNode),
                        stepRange,
                        () =>
                            explicitArguments.map((argument, argumentIndex) =>
                                this.createArgument(argument, argumentIndex + 1),
                            ),
                        piped,
                    ),
                ];
            }
            range = stepRange;
        }

        return result;
    }

    private range(node: ParseTree): Range {
        return rangeFromNode(node, this.document);
    }

    private startOf(node: ParseTree | null | undefined): Position | null {
        return node == null ? null : this.range(node).start;
    }

    private endOf(node: ParseTree | null | undefined): Position | null {
        return node == null ? null : this.range(node).end;
    }

    private namespaceDeclaration(node: ParserRuleContext): AstNode[] {
        const definition = this.declarations.namespaces.get(node);
        return definition === undefined ? [] : [this.createDeclarationNode(definition)];
    }

    /** Declares the variable of a binding in the current scope, or nothing for an incomplete binding. */
    private declareVariable(
        [binding, visibleFrom]: VariableBinding,
        range?: Range,
    ): SourceVariableDefinition | undefined {
        const name = binding == null ? null : parseVarName(binding);
        if (binding == null || name === null || visibleFrom === null) return undefined;

        const selectionRange = this.range(binding);
        const definition = this.definitions.variable(
            this.nameResolver.resolveQName(name, selectionRange),
            range ?? selectionRange,
            selectionRange,
        );
        this.currentScope.declare(definition, this.document.offsetAt(visibleFrom));
        return definition;
    }

    private declareVariables(bindings: readonly VariableBinding[]): AstNode[] {
        return bindings.flatMap((binding) => {
            const definition = this.declareVariable(binding);
            return definition === undefined ? [] : [this.createDeclarationNode(definition)];
        });
    }

    /** The declarations of the variables a node binds, followed by the nodes of its children. */
    private declarationsBeforeChildren(
        node: ParseTree,
        bindings: readonly VariableBinding[],
        visitChildren: () => AstNode[] = () => this.visitChildren(node),
    ): AstNode[] {
        return [...this.declareVariables(bindings), ...visitChildren()];
    }

    /** The declaration of the variable a node binds, spanning the node and holding its children. */
    private declarationWithChildren(node: ParseTree, binding: VariableBinding): AstNode[] {
        const definition = this.declareVariable(binding, this.range(node));
        const children = this.visitChildren(node);
        return definition === undefined
            ? children
            : [this.createDeclarationNode(definition, children)];
    }

    /** Visits an expression that has its own context item. */
    private withFocus(node: ParseTree, visit: () => AstNode[]): AstNode[] {
        const range = this.range(node);
        return this.enterScope(range, () => {
            const contextItem: ImplicitVariableDefinition = {
                kind: "variable",
                name: this.nameResolver.resolveQName(CONTEXT_ITEM_NAME, range),
                origin: "implicit",
            };
            this.currentScope.declare(contextItem, this.document.offsetAt(range.start));
            return visit();
        });
    }

    /** Visits the children of a node, giving each of the `focused` children its own context item. */
    private visitChildrenWithFocus(
        node: ParserRuleContext,
        focused: ReadonlyArray<ParserRuleContext | undefined>,
    ): AstNode[] {
        return (node.children ?? []).flatMap((child) =>
            focused.includes(child as ParserRuleContext)
                ? this.withFocus(child, () => this.visit(child))
                : this.visit(child),
        );
    }

    private createErrorCodeTarget(node: ctx.NameTestContext): ErrorCodeTargetNode {
        const range = this.range(node);
        const name = node.eqName();
        return {
            kind: "error-code-target",
            range,
            children: [],
            target:
                name === null
                    ? { kind: "wildcard", value: node.getText() }
                    : {
                          kind: "exact",
                          name: this.nameResolver.resolveQName(
                              parseQNameText(name.getText()),
                              range,
                          ),
                      },
        };
    }

    private createArgument(node: ctx.ArgumentContext, index: number): ArgumentNode {
        return {
            kind: "argument",
            range: this.range(node),
            children: this.visitChildren(node),
            index,
        };
    }

    /** A call, whose children are in source order: an arrow's operand, its first argument, precedes the name. */
    private createFunctionCall(
        lexicalName: LexicalFunctionName,
        selectionRange: Range,
        range: Range,
        visitArguments: () => AstNode[],
        piped?: ArgumentNode,
    ): FunctionCallNode {
        const name = this.nameResolver.resolveFunctionName(
            lexicalName,
            selectionRange,
            this.defaultFunctionNamespace,
        );
        const reference = this.createReference("function", name, selectionRange);
        const children = [...(piped === undefined ? [] : [piped]), reference, ...visitArguments()];
        return {
            kind: "function-call",
            range,
            children,
            name,
            selectionRange,
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
            this.document.offsetAt(range.start),
            this.document.offsetAt(range.end),
        );
        try {
            return callback();
        } finally {
            this.currentScope = previousScope;
        }
    }

    private resolve<K extends keyof ReferenceNameByKind>(
        kind: K,
        name: ReferenceNameByKind[K],
        offset: number,
    ): DefinitionByReferenceKind[K] | undefined {
        const builtinDefinition = this.resolveBuiltin(kind, name);
        if (builtinDefinition !== undefined) {
            return builtinDefinition;
        }

        return this.currentScope.resolve(kind, name, offset, this.excludedDefinitions);
    }

    private createReference<K extends keyof ReferenceNameByKind>(
        kind: K,
        name: ReferenceNameByKind[K],
        range: Range,
        reportUnresolved: boolean = true,
    ): ReferenceNode<K> {
        const declaration = this.resolve(kind, name, this.document.offsetAt(range.start));
        if (declaration === undefined) {
            if (reportUnresolved) {
                this.diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    message: `Reference to undefined ${kind} '${referenceNameToString(name, kind, true)}'`,
                    range,
                    code: `unresolved-${kind}`,
                });
            }
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
            uri: this.document.uri,
            range,
            declaration,
        } satisfies ResolvedReference<K>;

        return {
            kind: "reference",
            range,
            children: [],
            referenceKind: kind,
            name,
            resolution: resolvedReference,
        };
    }

    private declareModuleEnvironment(): void {
        this.declareImportedDefinitions();
        this.declarePrologDefinitions();
    }

    private declareImportedDefinitions(): void {
        for (const moduleImport of this.resolvedImportsByNamespace.values()) {
            for (const definition of moduleImport.exports.values())
                this.moduleScope.declare(definition, 0);
        }
    }

    private declarePrologDefinitions(): void {
        for (const definition of this.declarations.functions.values())
            this.moduleScope.declare(definition, 0);
        for (const definition of this.declarations.variables.values())
            this.moduleScope.declare(definition, 0);
        for (const definition of this.declarations.types.values())
            this.moduleScope.declare(definition, 0);
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
    document: TextDocument,
    tree: ctx.ModuleAndThisIsItContext,
    environment: AnalysisEnvironment = {},
): AnalysisResult {
    return new AnalysisBuilder(document, tree, environment).build();
}

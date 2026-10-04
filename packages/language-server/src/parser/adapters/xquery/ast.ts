import { CommonAstBuilder, type AstVisitResult } from "server/parser/shared/ast.js";
import type { ModuleAstNode } from "server/parser/types/ast.js";
import { parseQNameText } from "server/parser/types/name.js";
import { rangeFromNode } from "server/utils/range.js";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type * as ctx from "./grammar/XQueryParser.js";
import { XQueryParserVisitor } from "./grammar/XQueryParserVisitor.js";

class XQueryAstBuilder extends XQueryParserVisitor<AstVisitResult> {
    private readonly common: CommonAstBuilder;

    public constructor(private readonly document: TextDocument) {
        super();
        this.common = new CommonAstBuilder(document, {
            visit: (node) => (node == null ? [] : (this.visit(node) ?? [])),
            visitChildren: (node) => this.visitChildren(node) ?? [],
        });
    }

    protected override defaultResult(): AstVisitResult {
        return [];
    }

    protected override aggregateResult(
        aggregate: AstVisitResult,
        nextResult: AstVisitResult,
    ): AstVisitResult {
        return aggregate.concat(nextResult);
    }

    public override visitModuleAndThisIsIt = (node: ctx.ModuleAndThisIsItContext): AstVisitResult =>
        this.common.visitModuleAndThisIsIt(node);

    public override visitLibraryModule = (node: ctx.LibraryModuleContext): AstVisitResult =>
        this.common.visitLibraryModule(node);

    public override visitModuleImport = (node: ctx.ModuleImportContext): AstVisitResult =>
        this.common.visitModuleImport(node);

    public override visitBaseURIDecl = (node: ctx.BaseURIDeclContext): AstVisitResult =>
        this.common.visitBaseURIDecl(node);

    public override visitSchemaImport = (node: ctx.SchemaImportContext): AstVisitResult =>
        this.common.visitSchemaImport(node);

    public override visitDefaultNamespaceDecl = (
        node: ctx.DefaultNamespaceDeclContext,
    ): AstVisitResult => this.common.visitDefaultNamespaceDecl(node);

    public override visitNamespaceDecl = (node: ctx.NamespaceDeclContext): AstVisitResult =>
        this.common.visitNamespaceDecl(node);

    public override visitContextItemDecl = (node: ctx.ContextItemDeclContext): AstVisitResult =>
        this.common.visitContextItemDecl(node);

    public override visitContextItemExpr = (node: ctx.ContextItemExprContext): AstVisitResult =>
        this.common.visitContextItemExpr(node);

    public override visitFunctionDecl = (node: ctx.FunctionDeclContext): AstVisitResult =>
        this.common.visitFunctionDecl(node);

    public override visitVarDecl = (node: ctx.VarDeclContext): AstVisitResult =>
        this.common.visitVarDecl(node);

    public override visitForVar = (node: ctx.ForVarContext): AstVisitResult =>
        this.common.visitForVar(node);

    public override visitLetVar = (node: ctx.LetVarContext): AstVisitResult =>
        this.common.visitLetVar(node);

    public override visitTumblingWindowClause = (
        node: ctx.TumblingWindowClauseContext,
    ): AstVisitResult => this.common.visitTumblingWindowClause(node);

    public override visitSlidingWindowClause = (
        node: ctx.SlidingWindowClauseContext,
    ): AstVisitResult => this.common.visitSlidingWindowClause(node);

    public override visitWindowEndCondition = (
        node: ctx.WindowEndConditionContext,
    ): AstVisitResult => this.common.visitWindowEndCondition(node);

    public override visitWindowStartCondition = (
        node: ctx.WindowStartConditionContext,
    ): AstVisitResult => this.common.visitWindowStartCondition(node);

    public override visitCountClause = (node: ctx.CountClauseContext): AstVisitResult =>
        this.common.visitCountClause(node);

    public override visitGroupByClause = (node: ctx.GroupByClauseContext): AstVisitResult =>
        this.common.visitGroupByClause(node);

    public override visitQuantifiedExpr = (node: ctx.QuantifiedExprContext): AstVisitResult =>
        this.common.visitQuantifiedExpr(node);

    public override visitQuantifiedExprVar = (node: ctx.QuantifiedExprVarContext): AstVisitResult =>
        this.common.visitQuantifiedExprVar(node);

    public override visitTypeswitchExpr = (node: ctx.TypeswitchExprContext): AstVisitResult =>
        this.common.visitTypeswitchExpr(node);

    public override visitCaseClause = (node: ctx.CaseClauseContext): AstVisitResult =>
        this.common.visitCaseClause(node);

    public override visitInlineFunctionExpr = (
        node: ctx.InlineFunctionExprContext,
    ): AstVisitResult => this.common.visitInlineFunctionExpr(node);

    public override visitTypeSwitchStatement = (
        node: ctx.TypeSwitchStatementContext,
    ): AstVisitResult => this.common.visitTypeSwitchStatement(node);

    public override visitCaseStatement = (node: ctx.CaseStatementContext): AstVisitResult =>
        this.common.visitCaseStatement(node);

    public override visitVarDeclStatement = (node: ctx.VarDeclStatementContext): AstVisitResult =>
        this.common.visitVarDeclStatement(node);

    public override visitTransformExpr = (node: ctx.TransformExprContext): AstVisitResult =>
        this.common.visitTransformExpr(node);

    public override visitFlworExpr = (node: ctx.FlworExprContext): AstVisitResult =>
        this.common.visitFlworExpr(node);

    public override visitFlworStatement = (node: ctx.FlworStatementContext): AstVisitResult =>
        this.common.visitFlworStatement(node);

    public override visitVarRef = (node: ctx.VarRefContext): AstVisitResult =>
        this.common.visitVarRef(node);

    public override visitFunctionCall = (node: ctx.FunctionCallContext): AstVisitResult =>
        this.common.visitFunctionCall(node);

    public override visitNamedFunctionRef = (node: ctx.NamedFunctionRefContext): AstVisitResult =>
        this.common.visitNamedFunctionRef(node);

    public override visitCatchCaseStatement = (
        node: ctx.CatchCaseStatementContext,
    ): AstVisitResult => this.common.visitCatchCaseStatement(node);

    public override visitCatchClause = (node: ctx.CatchClauseContext): AstVisitResult =>
        this.common.visitCatchClause(node);

    public override visitArgumentList = (node: ctx.ArgumentListContext): AstVisitResult =>
        this.common.visitArgumentList(node);

    public override visitItemType = (node: ctx.ItemTypeContext): AstVisitResult => {
        const name = node.eqName();
        if (name === null) return this.visitChildren(node) ?? [];
        return [
            {
                kind: "type-reference",
                name: parseQNameText(name.getText()),
                range: rangeFromNode(name, this.document),
                children: [],
            },
        ];
    };
}

export function buildXQueryAst(
    tree: ctx.ModuleAndThisIsItContext,
    document: TextDocument,
): ModuleAstNode {
    const ast = new XQueryAstBuilder(document).visitModuleAndThisIsIt(tree)[0];
    if (ast === undefined || ast.kind !== "module") {
        throw new Error("Expected module AST root.");
    }
    return ast;
}

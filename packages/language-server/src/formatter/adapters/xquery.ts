import { ParseTree, TerminalNode, Token } from "antlr4ng";
import { composeTokenDoc, FormatterContext, type TokenDoc } from "server/formatter/context.js";
import { concat, Doc, NIL, space, spacedDocs } from "server/formatter/doc.js";
import {
    formatArgument,
    formatArgumentList,
    formatCurlyArrayConstructor,
    formatFunctionCall,
    formatPairObjectConstructor,
    formatParenthesizedExpression,
    formatPostfixExpression,
    formatSquareArrayConstructor,
} from "server/formatter/shared/collections.js";
import {
    formatCountClause,
    formatExpressionSequence,
    formatFlworExpression,
    formatForClause,
    formatForVariable,
    formatGroupByClause,
    formatGroupByVariable,
    formatLetClause,
    formatLetVariable,
    formatOrderByClause,
    formatWhereClause,
} from "server/formatter/shared/flwor.js";
import {
    formatBoundarySpaceDeclaration,
    formatAnnotation,
    formatAnnotatedDeclaration,
    formatAnnotations,
    formatCaseClause,
    formatCatchClause,
    formatEnclosedExpression,
    formatFunctionDeclaration,
    formatIfExpression,
    formatLibraryModule,
    formatMainModule,
    formatPairConstructor,
    formatPredicate,
    formatProlog,
    formatSequenceType,
    formatSwitchCaseClause,
    formatSwitchExpression,
    formatTryCatchExpression,
    formatTypeswitchExpression,
    formatVariableDeclaration,
    formatVariableName,
    formatDocumentRoot,
    formatModule,
    formatParameter,
    formatParameterList,
} from "server/formatter/shared/query.js";
import {
    formatApplyStatement,
    formatAssignStatement,
    formatBlockExpression,
    formatBlockStatement,
    formatBreakStatement,
    formatCaseStatement,
    formatCatchCaseStatement,
    formatContinueStatement,
    formatExitStatement,
    formatFlworStatement,
    formatIfStatement,
    formatProgram,
    formatStatements,
    formatStatementsAndExpression,
    formatStatementsAndOptionalExpression,
    formatSwitchCaseStatement,
    formatSwitchStatement,
    formatTryCatchStatement,
    formatTypeswitchStatement,
    formatVariableDeclarationForStatement,
    formatVariableDeclarationStatement,
    formatWhileStatement,
} from "server/formatter/shared/scripting.js";
import { formatStringConstructor } from "server/formatter/shared/string-constructor.js";
import {
    formatSourceRange,
    formatSourceTerminal,
    formatTokenDoc,
} from "server/formatter/shared/tokens.js";
import { formatDirectConstructor } from "server/formatter/shared/xml.js";
import { XQueryLexer } from "server/parser/adapters/xquery/grammar/XQueryLexer.js";
import { XQueryParser } from "server/parser/adapters/xquery/grammar/XQueryParser.js";
import type * as ctx from "server/parser/adapters/xquery/grammar/XQueryParser.js";
import { XQueryParserVisitor } from "server/parser/adapters/xquery/grammar/XQueryParserVisitor.js";

export class XQueryFormatterVisitor extends XQueryParserVisitor<Doc> {
    public constructor(private readonly ctx: FormatterContext) {
        super();
    }

    /**
     * Visit any parse tree node (terminal or rule context).
     * Terminals are routed through formatToken for comment attachment.
     */
    private v = (child: ParseTree | null | undefined): Doc => {
        if (child === null || child === undefined) {
            return NIL;
        }
        if ("accept" in child && typeof child.accept === "function") {
            return child.accept(this) ?? NIL;
        }
        return NIL;
    };

    /**
     * Visit a keyword or punctuation terminal (or token).
     * Fallback text is dynamically resolved from the Lexer token type.
     */
    private token = (
        terminal: TerminalNode | TerminalNode[] | Token | null | undefined,
        expectedToken: number | string,
    ): TokenDoc => {
        return formatTokenDoc(this.ctx, terminal, expectedToken, XQueryLexer.literalNames);
    };

    private kw = (
        terminal: TerminalNode | TerminalNode[] | Token | null | undefined,
        expectedToken: number | string,
    ): Doc => {
        return composeTokenDoc(this.token(terminal, expectedToken));
    };

    protected override defaultResult(): Doc {
        return NIL;
    }

    protected override aggregateResult(aggregate: Doc, nextResult: Doc): Doc {
        return spacedDocs(aggregate, nextResult);
    }

    public override visitTerminal = (node: TerminalNode): Doc => {
        return formatSourceTerminal(this.ctx, node);
    };

    public override visitStringLiteral = (node: ctx.StringLiteralContext): Doc => {
        return formatSourceRange(this.ctx, node);
    };

    public override visitUriLiteral = (node: ctx.UriLiteralContext): Doc => {
        return formatSourceRange(this.ctx, node);
    };

    public override visitStringConstructor = (node: ctx.StringConstructorContext): Doc => {
        return formatStringConstructor(this.ctx, node, this.v);
    };

    /** Formats XML tags and expressions while preserving semantic text gaps. */
    public override visitDirectConstructor = (node: ctx.DirectConstructorContext): Doc => {
        return formatDirectConstructor(
            this.ctx,
            {
                LANGLE: XQueryParser.LANGLE,
                RANGLE: XQueryParser.RANGLE,
                EQUAL: XQueryParser.EQUAL,
                SLASH: XQueryParser.SLASH,
                LBRACE: XQueryParser.LBRACE,
                RBRACE: XQueryParser.RBRACE,
            },
            node,
            this.v,
            this.kw,
        );
    };

    public override visitBoundarySpaceDecl = (node: ctx.BoundarySpaceDeclContext): Doc => {
        return formatBoundarySpaceDeclaration(this.ctx, node, this.kw);
    };

    // ─── Module & Prolog ──────────────────────────────────────────────────────

    public override visitModuleAndThisIsIt = (node: ctx.ModuleAndThisIsItContext): Doc => {
        return formatDocumentRoot(this.ctx, this.visitChildren(node) ?? NIL);
    };

    public override visitModule = (node: ctx.ModuleContext): Doc => {
        return formatModule(node, node.KW_XQUERY(), "xquery", this.v, this.kw);
    };

    public override visitLibraryModule = (node: ctx.LibraryModuleContext): Doc => {
        return formatLibraryModule(node, this.v, this.kw);
    };

    public override visitMainModule = (node: ctx.MainModuleContext): Doc => {
        return formatMainModule(node, this.v);
    };

    public override visitProlog = (node: ctx.PrologContext): Doc => {
        return formatProlog(this.ctx, node, XQueryParser, this.v);
    };

    public override visitAnnotatedDecl = (node: ctx.AnnotatedDeclContext): Doc => {
        return formatAnnotatedDeclaration(node, this.v);
    };

    // ─── Declarations ─────────────────────────────────────────────────────────

    public override visitFunctionDecl = (node: ctx.FunctionDeclContext): Doc => {
        return formatFunctionDeclaration(node, this.v, this.kw);
    };

    public override visitVarDecl = (node: ctx.VarDeclContext): Doc => {
        return formatVariableDeclaration(node, this.v, this.kw);
    };

    public override visitParamList = (node: ctx.ParamListContext): Doc => {
        return formatParameterList(node, XQueryParser.COMMA, this.v, this.kw);
    };

    public override visitParam = (node: ctx.ParamContext): Doc => {
        return formatParameter(node, this.v, this.kw);
    };

    public override visitAnnotations = (node: ctx.AnnotationsContext): Doc => {
        return formatAnnotations(node, this.v);
    };

    public override visitAnnotation = (node: ctx.AnnotationContext): Doc => {
        return formatAnnotation(node, XQueryParser.COMMA, this.v, this.kw);
    };

    // ─── Scripting Statements ────────────────────────────────────────────────

    public override visitProgram = (node: ctx.ProgramContext): Doc => {
        return formatProgram(node, this.v);
    };

    public override visitStatements = (node: ctx.StatementsContext): Doc => {
        return formatStatements(node, this.v);
    };

    public override visitStatementsAndExpr = (node: ctx.StatementsAndExprContext): Doc => {
        return formatStatementsAndExpression(node, this.v);
    };

    public override visitStatementsAndOptionalExpr = (
        node: ctx.StatementsAndOptionalExprContext,
    ): Doc => {
        return formatStatementsAndOptionalExpression(node, this.v);
    };

    public override visitStatement = (node: ctx.StatementContext): Doc => {
        return this.visitChildren(node) ?? NIL;
    };

    public override visitApplyStatement = (node: ctx.ApplyStatementContext): Doc => {
        return formatApplyStatement(node, this.v, this.kw);
    };

    public override visitAssignStatement = (node: ctx.AssignStatementContext): Doc => {
        return formatAssignStatement(node, this.v, this.kw);
    };

    public override visitBlockStatement = (node: ctx.BlockStatementContext): Doc => {
        return formatBlockStatement(node, this.v, this.kw);
    };

    public override visitBreakStatement = (node: ctx.BreakStatementContext): Doc => {
        return formatBreakStatement(node, this.kw);
    };

    public override visitContinueStatement = (node: ctx.ContinueStatementContext): Doc => {
        return formatContinueStatement(node, this.kw);
    };

    public override visitExitStatement = (node: ctx.ExitStatementContext): Doc => {
        return formatExitStatement(node, this.v, this.kw);
    };

    public override visitFlworStatement = (node: ctx.FlworStatementContext): Doc => {
        return formatFlworStatement(node, this.v, this.kw);
    };

    public override visitIfStatement = (node: ctx.IfStatementContext): Doc => {
        return formatIfStatement(node, this.v, this.kw);
    };

    public override visitSwitchStatement = (node: ctx.SwitchStatementContext): Doc => {
        return formatSwitchStatement(node, this.v, this.kw);
    };

    public override visitSwitchCaseStatement = (node: ctx.SwitchCaseStatementContext): Doc => {
        return formatSwitchCaseStatement(node, this.v, this.kw);
    };

    public override visitTryCatchStatement = (node: ctx.TryCatchStatementContext): Doc => {
        return formatTryCatchStatement(node, this.v, this.kw);
    };

    public override visitCatchCaseStatement = (node: ctx.CatchCaseStatementContext): Doc => {
        return formatCatchCaseStatement(node, this.v, this.kw);
    };

    public override visitTypeSwitchStatement = (node: ctx.TypeSwitchStatementContext): Doc => {
        return formatTypeswitchStatement(node, this.v, this.kw);
    };

    public override visitCaseStatement = (node: ctx.CaseStatementContext): Doc => {
        return formatCaseStatement(node, this.v, this.kw);
    };

    public override visitVarDeclStatement = (node: ctx.VarDeclStatementContext): Doc => {
        return formatVariableDeclarationStatement(node, XQueryParser.COMMA, this.v, this.kw);
    };

    public override visitVarDeclForStatement = (node: ctx.VarDeclForStatementContext): Doc => {
        return formatVariableDeclarationForStatement(node, this.v, this.kw);
    };

    public override visitWhileStatement = (node: ctx.WhileStatementContext): Doc => {
        return formatWhileStatement(node, this.v, this.kw);
    };

    public override visitBlockExpr = (node: ctx.BlockExprContext): Doc => {
        return formatBlockExpression(node, this.v, this.kw);
    };

    // ─── FLWOR Expressions ───────────────────────────────────────────────────

    public override visitFlworExpr = (node: ctx.FlworExprContext): Doc => {
        return formatFlworExpression(node, this.v, this.kw);
    };

    public override visitForClause = (node: ctx.ForClauseContext): Doc => {
        return formatForClause(node, XQueryParser.COMMA, this.v, this.kw);
    };

    public override visitForVar = (node: ctx.ForVarContext): Doc => {
        return formatForVariable(node, this.v, this.kw);
    };

    public override visitLetClause = (node: ctx.LetClauseContext): Doc => {
        return formatLetClause(node, XQueryParser.COMMA, this.v, this.kw);
    };

    public override visitLetVar = (node: ctx.LetVarContext): Doc => {
        return formatLetVariable(node, this.v, this.kw);
    };

    public override visitWhereClause = (node: ctx.WhereClauseContext): Doc => {
        return formatWhereClause(node, this.v, this.kw);
    };

    public override visitGroupByClause = (node: ctx.GroupByClauseContext): Doc => {
        return formatGroupByClause(node, XQueryParser.COMMA, this.v, this.kw);
    };

    public override visitGroupByVar = (node: ctx.GroupByVarContext): Doc => {
        return formatGroupByVariable(node, this.v, this.kw);
    };

    public override visitOrderByClause = (node: ctx.OrderByClauseContext): Doc => {
        return formatOrderByClause(node, XQueryParser.COMMA, this.v, this.kw);
    };

    public override visitCountClause = (node: ctx.CountClauseContext): Doc => {
        return formatCountClause(node, this.v, this.kw);
    };

    // ─── Expressions ──────────────────────────────────────────────────────────

    public override visitExpr = (node: ctx.ExprContext): Doc => {
        return formatExpressionSequence(node, XQueryParser.COMMA, this.v, this.kw);
    };

    public override visitIfExpr = (node: ctx.IfExprContext): Doc => {
        return formatIfExpression(node, this.v, this.kw);
    };

    public override visitTryCatchExpr = (node: ctx.TryCatchExprContext): Doc => {
        return formatTryCatchExpression(node, this.v, this.kw);
    };

    public override visitCatchClause = (node: ctx.CatchClauseContext): Doc => {
        return formatCatchClause(node, this.v, this.kw);
    };

    public override visitSwitchExpr = (node: ctx.SwitchExprContext): Doc => {
        return formatSwitchExpression(node, this.v, this.kw);
    };

    public override visitSwitchCaseClause = (node: ctx.SwitchCaseClauseContext): Doc => {
        return formatSwitchCaseClause(node, this.v, this.kw);
    };

    public override visitTypeswitchExpr = (node: ctx.TypeswitchExprContext): Doc => {
        return formatTypeswitchExpression(node, this.v, this.kw);
    };

    public override visitCaseClause = (node: ctx.CaseClauseContext): Doc => {
        return formatCaseClause(node, this.v, this.kw);
    };

    // ─── Maps & Arrays (XQuery 3.1) ───────────────────────────────────────────

    public override visitObjectConstructor = (node: ctx.ObjectConstructorContext): Doc => {
        const kwMap = this.token(node.KW_MAP(), XQueryParser.KW_MAP);
        const lb = this.kw(node.LBRACE(), XQueryParser.LBRACE);
        const rb = this.kw(node.RBRACE(), XQueryParser.RBRACE);
        const pairs = node.pairConstructor().map((p) => this.v(p));
        const commas = node.getTokens(XQueryParser.COMMA);
        return formatPairObjectConstructor(kwMap, concat([space, lb]), rb, pairs, commas, this.kw);
    };

    public override visitPairConstructor = (node: ctx.PairConstructorContext): Doc => {
        return formatPairConstructor(node, this.v, this.kw);
    };

    public override visitSquareArrayConstructor = (
        node: ctx.SquareArrayConstructorContext,
    ): Doc => {
        return formatSquareArrayConstructor(node, XQueryParser.COMMA, this.v, this.token, this.kw);
    };

    public override visitCurlyArrayConstructor = (node: ctx.CurlyArrayConstructorContext): Doc => {
        return formatCurlyArrayConstructor(node, this.v, this.kw);
    };

    public override visitPostfixExpr = (node: ctx.PostfixExprContext): Doc => {
        return formatPostfixExpression(node, this.v);
    };

    public override visitPredicate = (node: ctx.PredicateContext): Doc => {
        return formatPredicate(node, this.v, this.kw);
    };

    public override visitContextItemExpr = (node: ctx.ContextItemExprContext): Doc => {
        return this.kw(node.DOT(), XQueryParser.DOT);
    };

    // ─── Primary & Miscellaneous ──────────────────────────────────────────────

    public override visitParenthesizedExpr = (node: ctx.ParenthesizedExprContext): Doc => {
        return formatParenthesizedExpression(node, XQueryParser.COMMA, this.v, this.kw);
    };

    public override visitFunctionCall = (node: ctx.FunctionCallContext): Doc => {
        return formatFunctionCall(node, this.v);
    };

    public override visitArgumentList = (node: ctx.ArgumentListContext): Doc => {
        return formatArgumentList(node, XQueryParser.COMMA, this.v, this.kw);
    };

    public override visitArgument = (node: ctx.ArgumentContext): Doc => {
        return formatArgument(node, this.v, this.kw);
    };

    public override visitVarRef = (node: ctx.VarRefContext): Doc => {
        return formatVariableName(node, this.v, this.kw);
    };

    public override visitVarBinding = (node: ctx.VarBindingContext): Doc => {
        return formatVariableName(node, this.v, this.kw);
    };

    public override visitEnclosedExpression = (node: ctx.EnclosedExpressionContext): Doc => {
        return formatEnclosedExpression(node, this.v, this.kw);
    };

    public override visitSequenceType = (node: ctx.SequenceTypeContext): Doc => {
        return formatSequenceType(node, this.v, this.kw);
    };
}

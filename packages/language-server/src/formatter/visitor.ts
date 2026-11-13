import { type ParseTree, ParserRuleContext, type TerminalNode } from "antlr4ng";
import { composeTokenDoc, type FormatterContext, type TokenDoc } from "server/formatter/context.js";
import { concat, type Doc, NIL, space } from "server/formatter/doc.js";
import {
    formatArgument,
    formatArgumentList,
    formatCurlyArrayConstructor,
    formatFunctionCall,
    formatBracketedList,
    formatParenthesizedExpression,
    formatPostfixExpression,
    formatSquareArrayConstructor,
} from "server/formatter/shared/collections.js";
import {
    type DefaultLayoutRules,
    defaultLayoutRules,
    formatWithDefaultLayout,
    visitWithLeadingComments,
} from "server/formatter/shared/default-layout.js";
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
    formatWindowClause,
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
    formatVersionDecl,
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
import type { SourceTerminal } from "server/formatter/shared/types.js";
import { formatDirectConstructor } from "server/formatter/shared/xml.js";
import type { JsoniqParser } from "server/parser/adapters/jsoniq/grammar/JsoniqParser.js";
import type { XQueryParser } from "server/parser/adapters/xquery/grammar/XQueryParser.js";
import * as shared from "server/parser/context.js";

/** The grammar of a language: its parser, for rule indexes and token types, and the literal text of its tokens. */
export interface FormatterGrammar {
    readonly parser: typeof JsoniqParser | typeof XQueryParser;
    readonly literalNames: readonly (string | null)[];
}

/**
 * Formats the syntax that JSONiq and XQuery share. Their parsers dispatch a node to the visit method of its rule by
 * name, so one visitor serves both, and each language adds the visit methods of its own syntax.
 */
export abstract class FormatterVisitor extends shared.ParserVisitor<Doc> {
    private readonly defaultLayout: DefaultLayoutRules;

    protected constructor(
        protected readonly ctx: FormatterContext,
        protected readonly grammar: FormatterGrammar,
    ) {
        super();
        this.defaultLayout = defaultLayoutRules(grammar.parser);
    }

    /** Visits a node, with the comments on their own lines before it. */
    protected v = (child: ParseTree | null | undefined): Doc =>
        visitWithLeadingComments(this.ctx, child, this);

    /** Formats a source token, or the text of the expected token when the parser recovered without it. */
    protected token = (terminal: SourceTerminal, expectedToken: number | string): TokenDoc =>
        formatTokenDoc(this.ctx, terminal, expectedToken, this.grammar.literalNames);

    protected kw = (terminal: SourceTerminal, expectedToken: number | string): Doc =>
        composeTokenDoc(this.token(terminal, expectedToken));

    /** Formats a rule that this visitor does not format itself. */
    public override visitChildren = (node: ParseTree): Doc => {
        return node instanceof ParserRuleContext
            ? formatWithDefaultLayout(this.ctx, node, this.defaultLayout, this.v)
            : NIL;
    };

    protected override defaultResult(): Doc {
        return NIL;
    }

    public override visitTerminal = (node: TerminalNode): Doc => {
        return formatSourceTerminal(this.ctx, node);
    };

    public override visitStringLiteral = (node: shared.StringLiteralContext): Doc => {
        return formatSourceRange(this.ctx, node);
    };

    public override visitUriLiteral = (node: shared.UriLiteralContext): Doc => {
        return formatSourceRange(this.ctx, node);
    };

    public override visitStringConstructor = (node: shared.StringConstructorContext): Doc => {
        return formatStringConstructor(this.ctx, node, this.v);
    };

    /** Formats XML tags and expressions while preserving semantic text gaps. */
    public override visitDirectConstructor = (node: shared.DirectConstructorContext): Doc => {
        return formatDirectConstructor(this.ctx, this.grammar.parser, node, this.v, this.kw);
    };

    public override visitBoundarySpaceDecl = (node: shared.BoundarySpaceDeclContext): Doc => {
        return formatBoundarySpaceDeclaration(this.ctx, node, this.kw);
    };

    // ─── Module & Prolog ──────────────────────────────────────────────────────

    public override visitModuleAndThisIsIt = (node: shared.ModuleAndThisIsItContext): Doc => {
        return formatDocumentRoot(this.ctx, this.visitChildren(node) ?? NIL);
    };

    public override visitModule = (node: shared.ModuleContext): Doc => {
        return formatModule(node, this.v);
    };

    public override visitVersionDecl = (node: shared.VersionDeclContext): Doc => {
        return formatVersionDecl(node, this.v, this.kw);
    };

    public override visitLibraryModule = (node: shared.LibraryModuleContext): Doc => {
        return formatLibraryModule(node, this.v, this.kw);
    };

    public override visitMainModule = (node: shared.MainModuleContext): Doc => {
        return formatMainModule(node, this.v);
    };

    public override visitProlog = (node: shared.PrologContext): Doc => {
        return formatProlog(this.ctx, node, this.grammar.parser, this.v);
    };

    public override visitAnnotatedDecl = (node: shared.AnnotatedDeclContext): Doc => {
        return formatAnnotatedDeclaration(node, this.v);
    };

    // ─── Declarations ─────────────────────────────────────────────────────────

    public override visitFunctionDecl = (node: shared.FunctionDeclContext): Doc => {
        return formatFunctionDeclaration(
            node,
            this.v,
            this.kw,
            this.ctx.breaksLineAfter(node.LBRACE(), node._fn_body),
        );
    };

    public override visitVarDecl = (node: shared.VarDeclContext): Doc => {
        return formatVariableDeclaration(node, this.v, this.kw);
    };

    public override visitParamList = (node: shared.ParamListContext): Doc => {
        return formatParameterList(node, this.v, this.kw);
    };

    public override visitParam = (node: shared.ParamContext): Doc => {
        return formatParameter(node, this.v, this.kw);
    };

    public override visitAnnotations = (node: shared.AnnotationsContext): Doc => {
        return formatAnnotations(node, this.v);
    };

    public override visitAnnotation = (node: shared.AnnotationContext): Doc => {
        return formatAnnotation(node, this.v, this.kw);
    };

    // ─── Scripting Statements ────────────────────────────────────────────────

    public override visitProgram = (node: shared.ProgramContext): Doc => {
        return formatProgram(node, this.v);
    };

    public override visitStatements = (node: shared.StatementsContext): Doc => {
        return formatStatements(node, this.v);
    };

    public override visitStatementsAndExpr = (node: shared.StatementsAndExprContext): Doc => {
        return formatStatementsAndExpression(node, this.v);
    };

    public override visitStatementsAndOptionalExpr = (
        node: shared.StatementsAndOptionalExprContext,
    ): Doc => {
        return formatStatementsAndOptionalExpression(node, this.v);
    };

    public override visitApplyStatement = (node: shared.ApplyStatementContext): Doc => {
        return formatApplyStatement(node, this.v, this.kw);
    };

    public override visitAssignStatement = (node: shared.AssignStatementContext): Doc => {
        return formatAssignStatement(node, this.v, this.kw);
    };

    public override visitBlockStatement = (node: shared.BlockStatementContext): Doc => {
        return formatBlockStatement(node, this.v, this.kw);
    };

    public override visitBreakStatement = (node: shared.BreakStatementContext): Doc => {
        return formatBreakStatement(node, this.kw);
    };

    public override visitContinueStatement = (node: shared.ContinueStatementContext): Doc => {
        return formatContinueStatement(node, this.kw);
    };

    public override visitExitStatement = (node: shared.ExitStatementContext): Doc => {
        return formatExitStatement(node, this.v, this.kw);
    };

    public override visitFlworStatement = (node: shared.FlworStatementContext): Doc => {
        return formatFlworStatement(node, this.v, this.kw);
    };

    public override visitIfStatement = (node: shared.IfStatementContext): Doc => {
        return formatIfStatement(node, this.v, this.kw);
    };

    public override visitSwitchStatement = (node: shared.SwitchStatementContext): Doc => {
        return formatSwitchStatement(node, this.v, this.kw);
    };

    public override visitSwitchCaseStatement = (node: shared.SwitchCaseStatementContext): Doc => {
        return formatSwitchCaseStatement(node, this.v, this.kw);
    };

    public override visitTryCatchStatement = (node: shared.TryCatchStatementContext): Doc => {
        return formatTryCatchStatement(node, this.v, this.kw);
    };

    public override visitCatchCaseStatement = (node: shared.CatchCaseStatementContext): Doc => {
        return formatCatchCaseStatement(node, this.v, this.kw);
    };

    public override visitTypeSwitchStatement = (node: shared.TypeSwitchStatementContext): Doc => {
        return formatTypeswitchStatement(node, this.v, this.kw);
    };

    public override visitCaseStatement = (node: shared.CaseStatementContext): Doc => {
        return formatCaseStatement(node, this.v, this.kw);
    };

    public override visitVarDeclStatement = (node: shared.VarDeclStatementContext): Doc => {
        return formatVariableDeclarationStatement(node, this.v, this.kw);
    };

    public override visitVarDeclForStatement = (node: shared.VarDeclForStatementContext): Doc => {
        return formatVariableDeclarationForStatement(node, this.v, this.kw);
    };

    public override visitWhileStatement = (node: shared.WhileStatementContext): Doc => {
        return formatWhileStatement(node, this.v, this.kw);
    };

    public override visitBlockExpr = (node: shared.BlockExprContext): Doc => {
        return formatBlockExpression(node, this.v, this.kw);
    };

    // ─── FLWOR Expressions ───────────────────────────────────────────────────

    public override visitFlworExpr = (node: shared.FlworExprContext): Doc => {
        return formatFlworExpression(node, this.v, this.kw);
    };

    public override visitForClause = (node: shared.ForClauseContext): Doc => {
        return formatForClause(node, this.v, this.kw);
    };

    public override visitForVar = (node: shared.ForVarContext): Doc => {
        return formatForVariable(node, this.v, this.kw);
    };

    public override visitLetClause = (node: shared.LetClauseContext): Doc => {
        return formatLetClause(node, this.v, this.kw);
    };

    public override visitLetVar = (node: shared.LetVarContext): Doc => {
        return formatLetVariable(node, this.v, this.kw);
    };

    public override visitWhereClause = (node: shared.WhereClauseContext): Doc => {
        return formatWhereClause(node, this.v, this.kw);
    };

    public override visitGroupByClause = (node: shared.GroupByClauseContext): Doc => {
        return formatGroupByClause(node, this.v, this.kw);
    };

    public override visitGroupByVar = (node: shared.GroupByVarContext): Doc => {
        return formatGroupByVariable(node, this.v, this.kw);
    };

    public override visitOrderByClause = (node: shared.OrderByClauseContext): Doc => {
        return formatOrderByClause(node, this.v, this.kw);
    };

    public override visitTumblingWindowClause = (node: shared.TumblingWindowClauseContext): Doc => {
        return formatWindowClause(
            this.kw(node.KW_TUMBLING(), this.grammar.parser.KW_TUMBLING),
            node,
            this.v,
            this.kw,
        );
    };

    public override visitSlidingWindowClause = (node: shared.SlidingWindowClauseContext): Doc => {
        return formatWindowClause(
            this.kw(node.KW_SLIDING(), this.grammar.parser.KW_SLIDING),
            node,
            this.v,
            this.kw,
        );
    };

    public override visitCountClause = (node: shared.CountClauseContext): Doc => {
        return formatCountClause(node, this.v, this.kw);
    };

    // ─── Expressions ──────────────────────────────────────────────────────────

    public override visitExpr = (node: shared.ExprContext): Doc => {
        return formatExpressionSequence(node, this.v, this.kw);
    };

    public override visitIfExpr = (node: shared.IfExprContext): Doc => {
        return formatIfExpression(node, this.v, this.kw);
    };

    public override visitTryCatchExpr = (node: shared.TryCatchExprContext): Doc => {
        return formatTryCatchExpression(node, this.v, this.kw);
    };

    public override visitCatchClause = (node: shared.CatchClauseContext): Doc => {
        return formatCatchClause(node, this.v, this.kw);
    };

    public override visitSwitchExpr = (node: shared.SwitchExprContext): Doc => {
        return formatSwitchExpression(node, this.v, this.kw);
    };

    public override visitSwitchCaseClause = (node: shared.SwitchCaseClauseContext): Doc => {
        return formatSwitchCaseClause(node, this.v, this.kw);
    };

    public override visitTypeswitchExpr = (node: shared.TypeswitchExprContext): Doc => {
        return formatTypeswitchExpression(node, this.v, this.kw);
    };

    public override visitCaseClause = (node: shared.CaseClauseContext): Doc => {
        return formatCaseClause(node, this.v, this.kw);
    };

    public override visitObjectConstructor = (node: shared.ObjectConstructorContext): Doc => {
        return this.formatObjectConstructor(node);
    };

    /** Formats an object or a map constructor, `map { "a": 1 }`, whose `map` keyword JSONiq makes optional. */
    protected formatObjectConstructor(node: shared.ObjectConstructorContext): Doc {
        const leftBrace = this.token(node.LBRACE(), this.grammar.parser.LBRACE);
        // `map { … }` constructs a map rather than an object, so its keyword must be kept.
        const map = node.KW_MAP() ? this.token(node.KW_MAP(), this.grammar.parser.KW_MAP) : null;
        const opening: TokenDoc = map
            ? { ...map, trailing: concat([map.trailing, space, composeTokenDoc(leftBrace)]) }
            : leftBrace;
        return formatBracketedList(
            opening,
            node.pairConstructor().map((pair) => this.v(pair)),
            node.COMMA(),
            this.kw(node.RBRACE(), this.grammar.parser.RBRACE),
            this.kw,
            { expanded: this.ctx.breaksLineAfter(node.LBRACE(), node.pairConstructor()[0]) },
        );
    }

    public override visitPairConstructor = (node: shared.PairConstructorContext): Doc => {
        return formatPairConstructor(node, this.v, this.kw);
    };

    public override visitSquareArrayConstructor = (
        node: shared.SquareArrayConstructorContext,
    ): Doc => {
        return formatSquareArrayConstructor(node, this.v, this.token, this.kw);
    };

    public override visitCurlyArrayConstructor = (
        node: shared.CurlyArrayConstructorContext,
    ): Doc => {
        return formatCurlyArrayConstructor(node, this.v, this.kw);
    };

    public override visitPostfixExpr = (node: shared.PostfixExprContext): Doc => {
        return formatPostfixExpression(node, this.v);
    };

    public override visitPredicate = (node: shared.PredicateContext): Doc => {
        return formatPredicate(node, this.v, this.kw);
    };

    // ─── Primary & Miscellaneous ──────────────────────────────────────────────

    public override visitParenthesizedExpr = (node: shared.ParenthesizedExprContext): Doc => {
        return formatParenthesizedExpression(node, this.v, this.token, this.kw);
    };

    public override visitFunctionCall = (node: shared.FunctionCallContext): Doc => {
        return formatFunctionCall(node, this.v);
    };

    public override visitArgumentList = (node: shared.ArgumentListContext): Doc => {
        return formatArgumentList(node, this.v, this.token, this.kw);
    };

    public override visitArgument = (node: shared.ArgumentContext): Doc => {
        return formatArgument(node, this.v, this.kw);
    };

    public override visitVarRef = (node: shared.VarRefContext): Doc => {
        return formatVariableName(node, this.v, this.kw);
    };

    public override visitVarBinding = (node: shared.VarBindingContext): Doc => {
        return formatVariableName(node, this.v, this.kw);
    };

    public override visitEnclosedExpression = (node: shared.EnclosedExpressionContext): Doc => {
        return formatEnclosedExpression(node, this.v, this.kw);
    };

    public override visitSequenceType = (node: shared.SequenceTypeContext): Doc => {
        return formatSequenceType(node, this.v, this.kw);
    };
}

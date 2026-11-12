import {
    AbstractParseTreeVisitor,
    type ParseTree,
    ParserRuleContext,
    type TerminalNode,
} from "antlr4ng";
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
import type * as shared from "server/parser/context.js";

/** The grammar of a language: its parser, for rule indexes and token types, and the literal text of its tokens. */
export interface FormatterGrammar {
    readonly parser: typeof JsoniqParser | typeof XQueryParser;
    readonly literalNames: readonly (string | null)[];
}

/**
 * Formats the syntax that JSONiq and XQuery share. Their parsers dispatch a node to the visit method of its rule by
 * name, so one visitor serves both, and each language adds the visit methods of its own syntax.
 */
export abstract class FormatterVisitor extends AbstractParseTreeVisitor<Doc> {
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
    public override visitChildren(node: ParseTree): Doc {
        return node instanceof ParserRuleContext
            ? formatWithDefaultLayout(this.ctx, node, this.defaultLayout, this.v)
            : NIL;
    }

    protected override defaultResult(): Doc {
        return NIL;
    }

    public visitTerminal = (node: TerminalNode): Doc => {
        return formatSourceTerminal(this.ctx, node);
    };

    public visitStringLiteral = (node: shared.StringLiteralContext): Doc => {
        return formatSourceRange(this.ctx, node);
    };

    public visitUriLiteral = (node: shared.UriLiteralContext): Doc => {
        return formatSourceRange(this.ctx, node);
    };

    public visitStringConstructor = (node: shared.StringConstructorContext): Doc => {
        return formatStringConstructor(this.ctx, node, this.v);
    };

    /** Formats XML tags and expressions while preserving semantic text gaps. */
    public visitDirectConstructor = (node: shared.DirectConstructorContext): Doc => {
        return formatDirectConstructor(this.ctx, this.grammar.parser, node, this.v, this.kw);
    };

    public visitBoundarySpaceDecl = (node: shared.BoundarySpaceDeclContext): Doc => {
        return formatBoundarySpaceDeclaration(this.ctx, node, this.kw);
    };

    // ─── Module & Prolog ──────────────────────────────────────────────────────

    public visitModuleAndThisIsIt = (node: shared.ModuleAndThisIsItContext): Doc => {
        return formatDocumentRoot(this.ctx, this.visitChildren(node) ?? NIL);
    };

    public visitModule = (node: shared.ModuleContext): Doc => {
        return formatModule(node, this.v);
    };

    public visitVersionDecl = (node: shared.VersionDeclContext): Doc => {
        return formatVersionDecl(node, this.v, this.kw);
    };

    public visitLibraryModule = (node: shared.LibraryModuleContext): Doc => {
        return formatLibraryModule(node, this.v, this.kw);
    };

    public visitMainModule = (node: shared.MainModuleContext): Doc => {
        return formatMainModule(node, this.v);
    };

    public visitProlog = (node: shared.PrologContext): Doc => {
        return formatProlog(this.ctx, node, this.grammar.parser, this.v);
    };

    public visitAnnotatedDecl = (node: shared.AnnotatedDeclContext): Doc => {
        return formatAnnotatedDeclaration(node, this.v);
    };

    // ─── Declarations ─────────────────────────────────────────────────────────

    public visitFunctionDecl = (node: shared.FunctionDeclContext): Doc => {
        return formatFunctionDeclaration(
            node,
            this.v,
            this.kw,
            this.ctx.breaksLineAfter(node.LBRACE(), node._fn_body),
        );
    };

    public visitVarDecl = (node: shared.VarDeclContext): Doc => {
        return formatVariableDeclaration(node, this.v, this.kw);
    };

    public visitParamList = (node: shared.ParamListContext): Doc => {
        return formatParameterList(node, this.v, this.kw);
    };

    public visitParam = (node: shared.ParamContext): Doc => {
        return formatParameter(node, this.v, this.kw);
    };

    public visitAnnotations = (node: shared.AnnotationsContext): Doc => {
        return formatAnnotations(node, this.v);
    };

    public visitAnnotation = (node: shared.AnnotationContext): Doc => {
        return formatAnnotation(node, this.v, this.kw);
    };

    // ─── Scripting Statements ────────────────────────────────────────────────

    public visitProgram = (node: shared.ProgramContext): Doc => {
        return formatProgram(node, this.v);
    };

    public visitStatements = (node: shared.StatementsContext): Doc => {
        return formatStatements(node, this.v);
    };

    public visitStatementsAndExpr = (node: shared.StatementsAndExprContext): Doc => {
        return formatStatementsAndExpression(node, this.v);
    };

    public visitStatementsAndOptionalExpr = (
        node: shared.StatementsAndOptionalExprContext,
    ): Doc => {
        return formatStatementsAndOptionalExpression(node, this.v);
    };

    public visitApplyStatement = (node: shared.ApplyStatementContext): Doc => {
        return formatApplyStatement(node, this.v, this.kw);
    };

    public visitAssignStatement = (node: shared.AssignStatementContext): Doc => {
        return formatAssignStatement(node, this.v, this.kw);
    };

    public visitBlockStatement = (node: shared.BlockStatementContext): Doc => {
        return formatBlockStatement(node, this.v, this.kw);
    };

    public visitBreakStatement = (node: shared.BreakStatementContext): Doc => {
        return formatBreakStatement(node, this.kw);
    };

    public visitContinueStatement = (node: shared.ContinueStatementContext): Doc => {
        return formatContinueStatement(node, this.kw);
    };

    public visitExitStatement = (node: shared.ExitStatementContext): Doc => {
        return formatExitStatement(node, this.v, this.kw);
    };

    public visitFlworStatement = (node: shared.FlworStatementContext): Doc => {
        return formatFlworStatement(node, this.v, this.kw);
    };

    public visitIfStatement = (node: shared.IfStatementContext): Doc => {
        return formatIfStatement(node, this.v, this.kw);
    };

    public visitSwitchStatement = (node: shared.SwitchStatementContext): Doc => {
        return formatSwitchStatement(node, this.v, this.kw);
    };

    public visitSwitchCaseStatement = (node: shared.SwitchCaseStatementContext): Doc => {
        return formatSwitchCaseStatement(node, this.v, this.kw);
    };

    public visitTryCatchStatement = (node: shared.TryCatchStatementContext): Doc => {
        return formatTryCatchStatement(node, this.v, this.kw);
    };

    public visitCatchCaseStatement = (node: shared.CatchCaseStatementContext): Doc => {
        return formatCatchCaseStatement(node, this.v, this.kw);
    };

    public visitTypeSwitchStatement = (node: shared.TypeSwitchStatementContext): Doc => {
        return formatTypeswitchStatement(node, this.v, this.kw);
    };

    public visitCaseStatement = (node: shared.CaseStatementContext): Doc => {
        return formatCaseStatement(node, this.v, this.kw);
    };

    public visitVarDeclStatement = (node: shared.VarDeclStatementContext): Doc => {
        return formatVariableDeclarationStatement(node, this.v, this.kw);
    };

    public visitVarDeclForStatement = (node: shared.VarDeclForStatementContext): Doc => {
        return formatVariableDeclarationForStatement(node, this.v, this.kw);
    };

    public visitWhileStatement = (node: shared.WhileStatementContext): Doc => {
        return formatWhileStatement(node, this.v, this.kw);
    };

    public visitBlockExpr = (node: shared.BlockExprContext): Doc => {
        return formatBlockExpression(node, this.v, this.kw);
    };

    // ─── FLWOR Expressions ───────────────────────────────────────────────────

    public visitFlworExpr = (node: shared.FlworExprContext): Doc => {
        return formatFlworExpression(node, this.v, this.kw);
    };

    public visitForClause = (node: shared.ForClauseContext): Doc => {
        return formatForClause(node, this.v, this.kw);
    };

    public visitForVar = (node: shared.ForVarContext): Doc => {
        return formatForVariable(node, this.v, this.kw);
    };

    public visitLetClause = (node: shared.LetClauseContext): Doc => {
        return formatLetClause(node, this.v, this.kw);
    };

    public visitLetVar = (node: shared.LetVarContext): Doc => {
        return formatLetVariable(node, this.v, this.kw);
    };

    public visitWhereClause = (node: shared.WhereClauseContext): Doc => {
        return formatWhereClause(node, this.v, this.kw);
    };

    public visitGroupByClause = (node: shared.GroupByClauseContext): Doc => {
        return formatGroupByClause(node, this.v, this.kw);
    };

    public visitGroupByVar = (node: shared.GroupByVarContext): Doc => {
        return formatGroupByVariable(node, this.v, this.kw);
    };

    public visitOrderByClause = (node: shared.OrderByClauseContext): Doc => {
        return formatOrderByClause(node, this.v, this.kw);
    };

    public visitTumblingWindowClause = (node: shared.TumblingWindowClauseContext): Doc => {
        return formatWindowClause(
            this.kw(node.KW_TUMBLING(), this.grammar.parser.KW_TUMBLING),
            node,
            this.v,
            this.kw,
        );
    };

    public visitSlidingWindowClause = (node: shared.SlidingWindowClauseContext): Doc => {
        return formatWindowClause(
            this.kw(node.KW_SLIDING(), this.grammar.parser.KW_SLIDING),
            node,
            this.v,
            this.kw,
        );
    };

    public visitCountClause = (node: shared.CountClauseContext): Doc => {
        return formatCountClause(node, this.v, this.kw);
    };

    // ─── Expressions ──────────────────────────────────────────────────────────

    public visitExpr = (node: shared.ExprContext): Doc => {
        return formatExpressionSequence(node, this.v, this.kw);
    };

    public visitIfExpr = (node: shared.IfExprContext): Doc => {
        return formatIfExpression(node, this.v, this.kw);
    };

    public visitTryCatchExpr = (node: shared.TryCatchExprContext): Doc => {
        return formatTryCatchExpression(node, this.v, this.kw);
    };

    public visitCatchClause = (node: shared.CatchClauseContext): Doc => {
        return formatCatchClause(node, this.v, this.kw);
    };

    public visitSwitchExpr = (node: shared.SwitchExprContext): Doc => {
        return formatSwitchExpression(node, this.v, this.kw);
    };

    public visitSwitchCaseClause = (node: shared.SwitchCaseClauseContext): Doc => {
        return formatSwitchCaseClause(node, this.v, this.kw);
    };

    public visitTypeswitchExpr = (node: shared.TypeswitchExprContext): Doc => {
        return formatTypeswitchExpression(node, this.v, this.kw);
    };

    public visitCaseClause = (node: shared.CaseClauseContext): Doc => {
        return formatCaseClause(node, this.v, this.kw);
    };

    public visitObjectConstructor = (node: shared.ObjectConstructorContext): Doc => {
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

    public visitPairConstructor = (node: shared.PairConstructorContext): Doc => {
        return formatPairConstructor(node, this.v, this.kw);
    };

    public visitSquareArrayConstructor = (node: shared.SquareArrayConstructorContext): Doc => {
        return formatSquareArrayConstructor(node, this.v, this.token, this.kw);
    };

    public visitCurlyArrayConstructor = (node: shared.CurlyArrayConstructorContext): Doc => {
        return formatCurlyArrayConstructor(node, this.v, this.kw);
    };

    public visitPostfixExpr = (node: shared.PostfixExprContext): Doc => {
        return formatPostfixExpression(node, this.v);
    };

    public visitPredicate = (node: shared.PredicateContext): Doc => {
        return formatPredicate(node, this.v, this.kw);
    };

    // ─── Primary & Miscellaneous ──────────────────────────────────────────────

    public visitParenthesizedExpr = (node: shared.ParenthesizedExprContext): Doc => {
        return formatParenthesizedExpression(node, this.v, this.token, this.kw);
    };

    public visitFunctionCall = (node: shared.FunctionCallContext): Doc => {
        return formatFunctionCall(node, this.v);
    };

    public visitArgumentList = (node: shared.ArgumentListContext): Doc => {
        return formatArgumentList(node, this.v, this.token, this.kw);
    };

    public visitArgument = (node: shared.ArgumentContext): Doc => {
        return formatArgument(node, this.v, this.kw);
    };

    public visitVarRef = (node: shared.VarRefContext): Doc => {
        return formatVariableName(node, this.v, this.kw);
    };

    public visitVarBinding = (node: shared.VarBindingContext): Doc => {
        return formatVariableName(node, this.v, this.kw);
    };

    public visitEnclosedExpression = (node: shared.EnclosedExpressionContext): Doc => {
        return formatEnclosedExpression(node, this.v, this.kw);
    };

    public visitSequenceType = (node: shared.SequenceTypeContext): Doc => {
        return formatSequenceType(node, this.v, this.kw);
    };
}

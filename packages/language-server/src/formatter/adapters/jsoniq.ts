import { ParseTree, TerminalNode, Token } from "antlr4ng";
import {
    formatArgument,
    formatArgumentList,
    formatCurlyArrayConstructor,
    formatFunctionCall,
    formatPairObjectConstructor,
    formatParenthesizedExpression,
    formatPostfixExpression,
    formatSquareArrayConstructor,
} from "server/formatter/adapters/collections.js";
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
} from "server/formatter/adapters/flwor.js";
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
} from "server/formatter/adapters/scripting.js";
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
} from "server/formatter/adapters/shared.js";
import { formatStringConstructor } from "server/formatter/adapters/string-constructor.js";
import {
    formatSourceRange,
    formatSourceTerminal,
    formatTokenDoc,
    formatTokenSeparatedDocs,
} from "server/formatter/adapters/tokens.js";
import { formatDirectConstructor } from "server/formatter/adapters/xml.js";
import { composeTokenDoc, FormatterContext, type TokenDoc } from "server/formatter/context.js";
import { concat, Doc, indent, line, NIL, space, spacedDocs } from "server/formatter/doc.js";
import { groupStartingWith } from "server/formatter/helpers.js";
import { JsoniqLexer } from "server/parser/adapters/jsoniq/grammar/JsoniqLexer.js";
import { JsoniqParser } from "server/parser/adapters/jsoniq/grammar/JsoniqParser.js";
import type * as ctx from "server/parser/adapters/jsoniq/grammar/JsoniqParser.js";
import { JsoniqParserVisitor } from "server/parser/adapters/jsoniq/grammar/JsoniqParserVisitor.js";

export class JsoniqFormatterVisitor extends JsoniqParserVisitor<Doc> {
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
        return formatTokenDoc(this.ctx, terminal, expectedToken, JsoniqLexer.literalNames);
    };

    private kw = (
        terminal: TerminalNode | TerminalNode[] | Token | null | undefined,
        expectedToken: number | string,
    ): Doc => {
        return composeTokenDoc(this.token(terminal, expectedToken));
    };

    private joinWithCommas = (
        items: readonly Doc[],
        commas: readonly TerminalNode[],
        breakDoc: Doc = line,
    ): Doc =>
        formatTokenSeparatedDocs(
            items,
            commas,
            (comma) => this.kw(comma, JsoniqParser.COMMA),
            breakDoc,
        );

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
                LANGLE: JsoniqParser.LANGLE,
                RANGLE: JsoniqParser.RANGLE,
                EQUAL: JsoniqParser.EQUAL,
                SLASH: JsoniqParser.SLASH,
                LBRACE: JsoniqParser.LBRACE,
                RBRACE: JsoniqParser.RBRACE,
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
        return formatModule(node, node.KW_JSONIQ(), "jsoniq", this.v, this.kw);
    };

    public override visitLibraryModule = (node: ctx.LibraryModuleContext): Doc => {
        return formatLibraryModule(node, this.v, this.kw);
    };

    public override visitMainModule = (node: ctx.MainModuleContext): Doc => {
        return formatMainModule(node, this.v);
    };

    public override visitProlog = (node: ctx.PrologContext): Doc => {
        return formatProlog(this.ctx, node, JsoniqParser, this.v);
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
        return formatParameterList(node, JsoniqParser.COMMA, this.v, this.kw);
    };

    public override visitParam = (node: ctx.ParamContext): Doc => {
        return formatParameter(node, this.v, this.kw);
    };

    public override visitAnnotations = (node: ctx.AnnotationsContext): Doc => {
        return formatAnnotations(node, this.v);
    };

    public override visitAnnotation = (node: ctx.AnnotationContext): Doc => {
        if (node.KW_UPDATING() !== null || node._updating !== undefined) {
            return this.kw(node.KW_UPDATING(), JsoniqParser.KW_UPDATING);
        }
        return formatAnnotation(node, JsoniqParser.COMMA, this.v, this.kw);
    };

    public override visitTypeDecl = (node: ctx.TypeDeclContext): Doc => {
        const decl = this.kw(node.KW_DECLARE(), JsoniqParser.KW_DECLARE);
        const typeKw = this.kw(node.KW_TYPE(), JsoniqParser.KW_TYPE);
        const kwAs = this.kw(node.KW_AS(), JsoniqParser.KW_AS);
        const typeName = node._type_name ? this.v(node._type_name) : NIL;
        const typeDef = node._type_definition ? this.v(node._type_definition) : NIL;
        const schema = node.schemaLanguage() ? concat([this.v(node.schemaLanguage()), space]) : NIL;
        const semi = this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON);
        return concat([
            decl,
            space,
            typeKw,
            space,
            typeName,
            space,
            kwAs,
            space,
            schema,
            typeDef,
            semi,
        ]);
    };

    // ─── JSONiq Scripting Statements ─────────────────────────────────────────

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
        return formatVariableDeclarationStatement(node, JsoniqParser.COMMA, this.v, this.kw);
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
        return formatForClause(node, JsoniqParser.COMMA, this.v, this.kw);
    };

    public override visitForVar = (node: ctx.ForVarContext): Doc => {
        return formatForVariable(node, this.v, this.kw);
    };

    public override visitLetClause = (node: ctx.LetClauseContext): Doc => {
        return formatLetClause(node, JsoniqParser.COMMA, this.v, this.kw);
    };

    public override visitLetVar = (node: ctx.LetVarContext): Doc => {
        return formatLetVariable(node, this.v, this.kw);
    };

    public override visitWhereClause = (node: ctx.WhereClauseContext): Doc => {
        return formatWhereClause(node, this.v, this.kw);
    };

    public override visitGroupByClause = (node: ctx.GroupByClauseContext): Doc => {
        return formatGroupByClause(node, JsoniqParser.COMMA, this.v, this.kw);
    };

    public override visitGroupByVar = (node: ctx.GroupByVarContext): Doc => {
        return formatGroupByVariable(node, this.v, this.kw);
    };

    public override visitOrderByClause = (node: ctx.OrderByClauseContext): Doc => {
        return formatOrderByClause(node, JsoniqParser.COMMA, this.v, this.kw);
    };

    public override visitCountClause = (node: ctx.CountClauseContext): Doc => {
        return formatCountClause(node, this.v, this.kw);
    };

    // ─── Expressions ──────────────────────────────────────────────────────────

    public override visitExpr = (node: ctx.ExprContext): Doc => {
        return formatExpressionSequence(node, JsoniqParser.COMMA, this.v, this.kw);
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

    // ─── Object & Array Constructors (JSONiq) ─────────────────────────────────

    public override visitObjectConstructor = (node: ctx.ObjectConstructorContext): Doc => {
        if (
            node.LBRACE_VBAR() !== null ||
            (node._merge_operator && node._merge_operator.length > 0)
        ) {
            const lbv = this.token(node.LBRACE_VBAR(), JsoniqParser.LBRACE_VBAR);
            const rbv = this.kw(node.RBRACE_VBAR(), JsoniqParser.RBRACE_VBAR);
            const exprNode = node.expr();
            if (!exprNode) {
                return concat([composeTokenDoc(lbv), rbv]);
            }
            let formattedItems: Doc[];
            if ("exprSingle" in exprNode && typeof exprNode.exprSingle === "function") {
                formattedItems = (exprNode as ctx.ExprContext).exprSingle().map((e) => this.v(e));
            } else {
                formattedItems = [this.v(exprNode)];
            }
            return groupStartingWith(
                lbv,
                concat([
                    indent(
                        concat([
                            line,
                            this.joinWithCommas(formattedItems, node.getTokens(JsoniqParser.COMMA)),
                        ]),
                    ),
                    line,
                    rbv,
                ]),
            );
        }

        const lb = this.token(node.LBRACE(), JsoniqParser.LBRACE);
        const rb = this.kw(node.RBRACE(), JsoniqParser.RBRACE);
        const pairs = node.pairConstructor().map((p) => this.v(p));
        return formatPairObjectConstructor(
            lb,
            NIL,
            rb,
            pairs,
            node.getTokens(JsoniqParser.COMMA),
            this.kw,
        );
    };

    public override visitPairConstructor = (node: ctx.PairConstructorContext): Doc => {
        return formatPairConstructor(node, this.v, this.kw);
    };

    public override visitSquareArrayConstructor = (
        node: ctx.SquareArrayConstructorContext,
    ): Doc => {
        return formatSquareArrayConstructor(node, JsoniqParser.COMMA, this.v, this.token, this.kw);
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

    public override visitObjectLookup = (node: ctx.ObjectLookupContext): Doc => {
        const dot = this.kw(node.DOT(), JsoniqParser.DOT);
        const key = this.v(node.getChild(1) as ParseTree);
        return concat([dot, key]);
    };

    public override visitArrayLookup = (node: ctx.ArrayLookupContext): Doc => {
        const lb1 = this.kw(node.LBRACKET(0), JsoniqParser.LBRACKET);
        const lb2 = this.kw(node.LBRACKET(1), JsoniqParser.LBRACKET);
        const rb1 = this.kw(node.RBRACKET(0), JsoniqParser.RBRACKET);
        const rb2 = this.kw(node.RBRACKET(1), JsoniqParser.RBRACKET);
        const expr = node.expr() ? this.v(node.expr()) : NIL;
        return concat([lb1, lb2, expr, rb1, rb2]);
    };

    public override visitArrayUnboxing = (node: ctx.ArrayUnboxingContext): Doc => {
        const lb = this.kw(node.LBRACKET(), JsoniqParser.LBRACKET);
        const rb = this.kw(node.RBRACKET(), JsoniqParser.RBRACKET);
        return concat([lb, rb]);
    };

    public override visitContextItemExpr = (node: ctx.ContextItemExprContext): Doc => {
        return this.kw(node.DOUBLE_DOLLAR(), JsoniqParser.DOUBLE_DOLLAR);
    };

    // ─── Primary & Miscellaneous ──────────────────────────────────────────────

    public override visitParenthesizedExpr = (node: ctx.ParenthesizedExprContext): Doc => {
        return formatParenthesizedExpression(node, JsoniqParser.COMMA, this.v, this.kw);
    };

    public override visitFunctionCall = (node: ctx.FunctionCallContext): Doc => {
        return formatFunctionCall(node, this.v);
    };

    public override visitArgumentList = (node: ctx.ArgumentListContext): Doc => {
        return formatArgumentList(node, JsoniqParser.COMMA, this.v, this.kw);
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

import { ParseTree, TerminalNode, Token } from "antlr4ng";
import {
    formatBoundarySpaceDeclaration,
    formatAnnotation,
    formatAnnotatedDeclaration,
    formatAnnotations,
    formatArgument,
    formatArgumentList,
    formatCaseClause,
    formatCatchClause,
    formatEnclosedExpression,
    formatExpressionSequence,
    formatFlworExpression,
    formatForClause,
    formatForVariable,
    formatFunctionDeclaration,
    formatGroupByClause,
    formatGroupByVariable,
    formatIfExpression,
    formatLetClause,
    formatLetVariable,
    formatLibraryModule,
    formatMainModule,
    formatOrderByClause,
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
    formatWhereClause,
    formatCountClause,
    formatCurlyArrayConstructor,
    formatFunctionCall,
    formatParameter,
    formatParameterList,
    formatParenthesizedExpression,
    formatPostfixExpression,
    formatSquareArrayConstructor,
} from "server/formatter/adapters/shared.js";
import { formatTokenDoc, formatTokenSeparatedDocs } from "server/formatter/adapters/tokens.js";
import { formatDirectConstructor } from "server/formatter/adapters/xml.js";
import { composeTokenDoc, FormatterContext, type TokenDoc } from "server/formatter/context.js";
import { concat, Doc, hardline, indent, join, line, NIL, space } from "server/formatter/doc.js";
import { formatBlockDoc, groupStartingWith } from "server/formatter/helpers.js";
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

    private joinWithCommas = (
        items: readonly Doc[],
        commas: readonly TerminalNode[],
        breakDoc: Doc = line,
    ): Doc =>
        formatTokenSeparatedDocs(
            items,
            commas,
            (comma) => this.kw(comma, XQueryParser.COMMA),
            breakDoc,
        );

    protected override defaultResult(): Doc {
        return NIL;
    }

    protected override aggregateResult(aggregate: Doc, nextResult: Doc): Doc {
        if (aggregate.kind === "text" && aggregate.text === "") {
            return nextResult;
        }
        if (nextResult.kind === "text" && nextResult.text === "") {
            return aggregate;
        }
        return concat([aggregate, space, nextResult]);
    }

    public override visitTerminal = (node: TerminalNode): Doc => {
        if (node.symbol.type === -1 /* Token.EOF */ || node.getText() === "<EOF>") {
            return NIL;
        }
        return composeTokenDoc(this.ctx.formatToken(node));
    };

    public override visitStringLiteral = (node: ctx.StringLiteralContext): Doc => {
        return composeTokenDoc(this.ctx.formatTokenRange(node.start!, node.stop!));
    };

    public override visitUriLiteral = (node: ctx.UriLiteralContext): Doc => {
        return composeTokenDoc(this.ctx.formatTokenRange(node.start!, node.stop!));
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
            },
            node,
            this.kw,
            (content) => {
                const expr = content.expr();
                return formatBlockDoc(
                    this.kw(content.LBRACE(0), XQueryParser.LBRACE),
                    this.v(expr),
                    this.kw(content.RBRACE(0), XQueryParser.RBRACE),
                );
            },
        );
    };

    public override visitBoundarySpaceDecl = (node: ctx.BoundarySpaceDeclContext): Doc => {
        return formatBoundarySpaceDeclaration(this.ctx, node, this.kw);
    };

    // ─── Module & Prolog ──────────────────────────────────────────────────────

    public override visitModuleAndThisIsIt = (node: ctx.ModuleAndThisIsItContext): Doc => {
        const body = this.visitChildren(node) ?? NIL;
        const dangling = this.ctx.formatDanglingDoc();
        return concat([body, dangling]);
    };

    public override visitModule = (node: ctx.ModuleContext): Doc => {
        const parts: Doc[] = [];
        if (node.KW_XQUERY() !== null) {
            const kwXquery = this.kw(node.KW_XQUERY(), XQueryParser.KW_XQUERY);
            const kwVer = this.kw(node.KW_VERSION(), XQueryParser.KW_VERSION);
            const versionStr = node._vers ? this.v(node._vers) : NIL;
            const encStr = node._encoding
                ? concat([
                      space,
                      this.kw(node.KW_ENCODING(), XQueryParser.KW_ENCODING),
                      space,
                      this.v(node._encoding),
                  ])
                : NIL;
            const semi = this.kw(node.SEMICOLON(), XQueryParser.SEMICOLON);
            parts.push(concat([kwXquery, space, kwVer, space, versionStr, encStr, semi]));
        }
        if (node.libraryModule()) {
            parts.push(this.v(node.libraryModule()));
        } else if (node.mainModule().length > 0) {
            for (const m of node.mainModule()) {
                parts.push(this.v(m));
            }
        }
        return join(concat([hardline, hardline]), parts);
    };

    public override visitLibraryModule = (node: ctx.LibraryModuleContext): Doc => {
        return formatLibraryModule(node, this.v, this.kw);
    };

    public override visitMainModule = (node: ctx.MainModuleContext): Doc => {
        return formatMainModule(node, this.v);
    };

    public override visitProlog = (node: ctx.PrologContext): Doc => {
        return formatProlog(this.ctx, node, this.v);
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
        if (pairs.length === 0) {
            return concat([composeTokenDoc(kwMap), space, lb, rb]);
        }

        if (pairs.length > 2) {
            return concat([
                composeTokenDoc(kwMap),
                space,
                lb,
                indent(concat([hardline, this.joinWithCommas(pairs, commas, hardline)])),
                hardline,
                rb,
            ]);
        }

        return groupStartingWith(
            kwMap,
            concat([
                space,
                lb,
                indent(concat([line, this.joinWithCommas(pairs, commas)])),
                line,
                rb,
            ]),
        );
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

import { ParseTree, TerminalNode, Token } from "antlr4ng";
import {
    formatDirectConstructor,
    formatTokenDoc,
    formatTokenSeparatedDocs,
} from "server/formatter/adapters/common.js";
import {
    formatBoundarySpaceDeclaration,
    formatAnnotatedDeclaration,
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
} from "server/formatter/adapters/shared.js";
import { composeTokenDoc, FormatterContext, type TokenDoc } from "server/formatter/context.js";
import {
    concat,
    Doc,
    group,
    hardline,
    indent,
    join,
    line,
    NIL,
    softline,
    space,
} from "server/formatter/doc.js";
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
    private token(
        terminal: TerminalNode | TerminalNode[] | Token | null | undefined,
        expectedToken: number | string,
    ): TokenDoc {
        return formatTokenDoc(this.ctx, terminal, expectedToken, XQueryLexer.literalNames);
    }

    private kw(
        terminal: TerminalNode | TerminalNode[] | Token | null | undefined,
        expectedToken: number | string,
    ): Doc {
        return composeTokenDoc(this.token(terminal, expectedToken));
    }

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
            (terminal, expectedToken) => this.kw(terminal, expectedToken),
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
        return formatBoundarySpaceDeclaration(this.ctx, node, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
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
        return formatLibraryModule(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
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
        return formatFunctionDeclaration(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitVarDecl = (node: ctx.VarDeclContext): Doc => {
        return formatVariableDeclaration(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitParamList = (node: ctx.ParamListContext): Doc => {
        return this.joinWithCommas(
            node.param().map((param) => this.v(param)),
            node.getTokens(XQueryParser.COMMA),
        );
    };

    public override visitParam = (node: ctx.ParamContext): Doc => {
        const name = node.varBinding() ? this.v(node.varBinding()) : NIL;
        const typeSeq = node.sequenceType()
            ? concat([
                  space,
                  this.kw(node.KW_AS(), XQueryParser.KW_AS),
                  space,
                  this.v(node.sequenceType()),
              ])
            : NIL;
        return concat([name, typeSeq]);
    };

    public override visitAnnotations = (node: ctx.AnnotationsContext): Doc => {
        return join(
            space,
            node.annotation().map((a) => this.v(a)),
        );
    };

    public override visitAnnotation = (node: ctx.AnnotationContext): Doc => {
        const pct = this.kw(node.MOD(), XQueryParser.MOD);
        const name = node._name ? this.v(node._name) : NIL;
        const lits = node.literal().map((l) => this.v(l));
        if (lits.length > 0) {
            const lp = this.kw(node.LPAREN(), XQueryParser.LPAREN);
            const rp = this.kw(node.RPAREN(), XQueryParser.RPAREN);
            return concat([
                pct,
                name,
                lp,
                this.joinWithCommas(lits, node.getTokens(XQueryParser.COMMA)),
                rp,
            ]);
        }
        return concat([pct, name]);
    };

    // ─── FLWOR Expressions ───────────────────────────────────────────────────

    public override visitFlworExpr = (node: ctx.FlworExprContext): Doc => {
        return formatFlworExpression(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitForClause = (node: ctx.ForClauseContext): Doc => {
        return formatForClause(node, XQueryParser.COMMA, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitForVar = (node: ctx.ForVarContext): Doc => {
        return formatForVariable(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitLetClause = (node: ctx.LetClauseContext): Doc => {
        return formatLetClause(node, XQueryParser.COMMA, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitLetVar = (node: ctx.LetVarContext): Doc => {
        return formatLetVariable(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitWhereClause = (node: ctx.WhereClauseContext): Doc => {
        return formatWhereClause(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitGroupByClause = (node: ctx.GroupByClauseContext): Doc => {
        return formatGroupByClause(node, XQueryParser.COMMA, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitGroupByVar = (node: ctx.GroupByVarContext): Doc => {
        return formatGroupByVariable(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitOrderByClause = (node: ctx.OrderByClauseContext): Doc => {
        return formatOrderByClause(node, XQueryParser.COMMA, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitCountClause = (node: ctx.CountClauseContext): Doc => {
        return formatCountClause(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    // ─── Expressions ──────────────────────────────────────────────────────────

    public override visitExpr = (node: ctx.ExprContext): Doc => {
        return formatExpressionSequence(
            node,
            XQueryParser.COMMA,
            this.v,
            (terminal, expectedToken) => this.kw(terminal, expectedToken),
        );
    };

    public override visitIfExpr = (node: ctx.IfExprContext): Doc => {
        return formatIfExpression(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitTryCatchExpr = (node: ctx.TryCatchExprContext): Doc => {
        return formatTryCatchExpression(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitCatchClause = (node: ctx.CatchClauseContext): Doc => {
        return formatCatchClause(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitSwitchExpr = (node: ctx.SwitchExprContext): Doc => {
        return formatSwitchExpression(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitSwitchCaseClause = (node: ctx.SwitchCaseClauseContext): Doc => {
        return formatSwitchCaseClause(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitTypeswitchExpr = (node: ctx.TypeswitchExprContext): Doc => {
        return formatTypeswitchExpression(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitCaseClause = (node: ctx.CaseClauseContext): Doc => {
        return formatCaseClause(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
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
        return formatPairConstructor(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitSquareArrayConstructor = (
        node: ctx.SquareArrayConstructorContext,
    ): Doc => {
        const lbracket = this.token(node.LBRACKET(), XQueryParser.LBRACKET);
        const rbracket = this.kw(node.RBRACKET(), XQueryParser.RBRACKET);
        const exprSingles = node.exprSingle();
        if (exprSingles.length === 0) {
            return concat([composeTokenDoc(lbracket), rbracket]);
        }

        const items = exprSingles.map((e) => this.v(e));
        return groupStartingWith(
            lbracket,
            concat([
                indent(
                    concat([line, this.joinWithCommas(items, node.getTokens(XQueryParser.COMMA))]),
                ),
                line,
                rbracket,
            ]),
        );
    };

    public override visitCurlyArrayConstructor = (node: ctx.CurlyArrayConstructorContext): Doc => {
        const kwArray = this.kw(node.KW_ARRAY(), XQueryParser.KW_ARRAY);
        const enclosed = node.enclosedExpression() ? this.v(node.enclosedExpression()) : NIL;
        return concat([kwArray, space, enclosed]);
    };

    public override visitPostfixExpr = (node: ctx.PostfixExprContext): Doc => {
        const count = node.getChildCount();
        const parts: Doc[] = [];
        for (let i = 0; i < count; i++) {
            const child = node.getChild(i);
            if (child !== null) {
                parts.push(this.v(child));
            }
        }
        return concat(parts);
    };

    public override visitPredicate = (node: ctx.PredicateContext): Doc => {
        return formatPredicate(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitContextItemExpr = (node: ctx.ContextItemExprContext): Doc => {
        return this.kw(node.DOT(), XQueryParser.DOT);
    };

    // ─── Primary & Miscellaneous ──────────────────────────────────────────────

    public override visitParenthesizedExpr = (node: ctx.ParenthesizedExprContext): Doc => {
        const exprNode = node.expr();
        const lp = this.kw(node.LPAREN(), XQueryParser.LPAREN);
        const rp = this.kw(node.RPAREN(), XQueryParser.RPAREN);

        if (!exprNode) {
            return concat([lp, rp]);
        }

        let items: Doc[];
        if ("exprSingle" in exprNode && typeof exprNode.exprSingle === "function") {
            items = (exprNode as ctx.ExprContext).exprSingle().map((e) => this.v(e));
        } else {
            items = [this.v(exprNode)];
        }

        return concat([
            lp,
            group(
                concat([
                    indent(
                        concat([
                            softline,
                            this.joinWithCommas(items, node.getTokens(XQueryParser.COMMA)),
                        ]),
                    ),
                    softline,
                    rp,
                ]),
            ),
        ]);
    };

    public override visitFunctionCall = (node: ctx.FunctionCallContext): Doc => {
        const fnName = node._fn_name ? this.v(node._fn_name) : NIL;
        const args = node.argumentList() ? this.v(node.argumentList()) : NIL;
        return concat([fnName, args]);
    };

    public override visitArgumentList = (node: ctx.ArgumentListContext): Doc => {
        const lp = this.kw(node.LPAREN(), XQueryParser.LPAREN);
        const rp = this.kw(node.RPAREN(), XQueryParser.RPAREN);
        const args = node.argument().map((a) => this.v(a));
        if (args.length === 0) {
            return concat([lp, rp]);
        }

        return concat([
            lp,
            group(
                concat([
                    indent(
                        concat([
                            softline,
                            this.joinWithCommas(args, node.getTokens(XQueryParser.COMMA)),
                        ]),
                    ),
                    softline,
                    rp,
                ]),
            ),
        ]);
    };

    public override visitArgument = (node: ctx.ArgumentContext): Doc => {
        if (node.QUESTION() !== null) {
            return this.kw(node.QUESTION(), XQueryParser.QUESTION);
        }
        return node.exprSingle() ? this.v(node.exprSingle()) : NIL;
    };

    public override visitVarRef = (node: ctx.VarRefContext): Doc => {
        return formatVariableName(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitVarBinding = (node: ctx.VarBindingContext): Doc => {
        return formatVariableName(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitEnclosedExpression = (node: ctx.EnclosedExpressionContext): Doc => {
        return formatEnclosedExpression(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };

    public override visitSequenceType = (node: ctx.SequenceTypeContext): Doc => {
        return formatSequenceType(node, this.v, (terminal, expectedToken) =>
            this.kw(terminal, expectedToken),
        );
    };
}

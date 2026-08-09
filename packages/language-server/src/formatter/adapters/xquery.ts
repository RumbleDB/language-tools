import { ParseTree, TerminalNode, Token } from "antlr4ng";
import { formatDirectConstructor, formatTokenDoc } from "server/formatter/adapters/common.js";
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
    spacedDocs,
    text,
} from "server/formatter/doc.js";
import {
    formatBlockDoc,
    formatCommaSeparatedDocs,
    formatFlworExpressionDoc,
    formatIfExpressionDoc,
    formatTryCatchDoc,
    groupStartingWith,
    shouldSeparateDeclarations,
} from "server/formatter/helpers.js";
import { printDocToString } from "server/formatter/printer.js";
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

    private vStrDoc = (doc: Doc): string => {
        return printDocToString(doc, this.ctx.options);
    };

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
        const isPreserve = node.KW_PRESERVE() !== null;
        this.ctx.setXmlBoundarySpacePolicy(isPreserve ? "preserve" : "strip");
        return concat([
            this.kw(node.KW_DECLARE(), XQueryParser.KW_DECLARE),
            space,
            this.kw(node.KW_BOUNDARY_SPACE(), XQueryParser.KW_BOUNDARY_SPACE),
            space,
            this.kw(
                isPreserve ? node.KW_PRESERVE() : node.KW_STRIP(),
                isPreserve ? XQueryParser.KW_PRESERVE : XQueryParser.KW_STRIP,
            ),
            this.kw(node.SEMICOLON(), XQueryParser.SEMICOLON),
        ]);
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
        const kwModule = this.kw(node.KW_MODULE(), XQueryParser.KW_MODULE);
        const kwNamespace = this.kw(node.KW_NAMESPACE(), XQueryParser.KW_NAMESPACE);
        const ncName = node.ncName() ? this.v(node.ncName()) : NIL;
        const eq = this.kw(node.EQUAL(), XQueryParser.EQUAL);
        const uri = node._uri ? this.v(node._uri) : NIL;
        const semi = this.kw(node.SEMICOLON(), XQueryParser.SEMICOLON);
        const prolog = node.prolog() ? this.v(node.prolog()) : NIL;
        const header = concat([
            kwModule,
            space,
            kwNamespace,
            space,
            ncName,
            space,
            eq,
            space,
            uri,
            semi,
        ]);
        return prolog.kind !== "text" ? concat([header, hardline, hardline, prolog]) : header;
    };

    public override visitMainModule = (node: ctx.MainModuleContext): Doc => {
        const prolog = node.prolog() ? this.v(node.prolog()) : NIL;
        const program = node.program() ? this.v(node.program()) : NIL;
        if (prolog.kind !== "text" && program.kind !== "text") {
            return concat([prolog, hardline, hardline, program]);
        }
        return prolog.kind !== "text" ? prolog : program;
    };

    public override visitProlog = (node: ctx.PrologContext): Doc => {
        const parts: Doc[] = [];
        const count = node.getChildCount();
        for (let i = 0; i < count; i++) {
            const child = node.getChild(i);
            if (child === null || child instanceof TerminalNode) {
                continue;
            }
            const res = this.v(child);
            if (res.kind !== "text" || res.text !== "") {
                parts.push(res);
            }
        }
        if (parts.length === 0) {
            return NIL;
        }
        const docs: Doc[] = [parts[0]!];
        for (let i = 1; i < parts.length; i++) {
            const prevStr = this.vStrDoc(parts[i - 1]!);
            const currStr = this.vStrDoc(parts[i]!);
            const sep =
                this.ctx.options.blankLineBetweenDeclarations &&
                shouldSeparateDeclarations(prevStr, currStr)
                    ? concat([hardline, hardline])
                    : hardline;
            docs.push(sep);
            docs.push(parts[i]!);
        }
        return concat(docs);
    };

    public override visitAnnotatedDecl = (node: ctx.AnnotatedDeclContext): Doc => {
        const count = node.getChildCount();
        const parts: Doc[] = [];
        for (let i = 0; i < count; i++) {
            const child = node.getChild(i);
            if (child !== null) {
                const res = this.v(child);
                if (res.kind !== "text" || res.text !== "") {
                    parts.push(res);
                }
            }
        }
        return concat(parts);
    };

    // ─── Declarations ─────────────────────────────────────────────────────────

    public override visitFunctionDecl = (node: ctx.FunctionDeclContext): Doc => {
        const decl = this.kw(node.KW_DECLARE(), XQueryParser.KW_DECLARE);
        const annotations = node.annotations() ? this.v(node.annotations()) : NIL;
        const fnKw = this.kw(node.KW_FUNCTION(), XQueryParser.KW_FUNCTION);
        const name = node.functionName() ? this.v(node.functionName()) : NIL;
        const lparen = this.kw(node.LPAREN(), XQueryParser.LPAREN);
        const rparen = this.kw(node.RPAREN(), XQueryParser.RPAREN);
        const params = node.paramList()
            ? concat([lparen, this.v(node.paramList()), rparen])
            : concat([lparen, rparen]);
        const returnType = node._return_type ? this.v(node._return_type) : null;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), XQueryParser.KW_AS) : null;
        const isExternal = node.KW_EXTERNAL() !== null || node._is_external !== undefined;

        const signature = spacedDocs(decl, annotations, fnKw, concat([name, params]));
        const withReturn =
            returnType !== null && kwAs !== null
                ? spacedDocs(signature, kwAs, returnType)
                : signature;

        const semi = this.kw(node.SEMICOLON(), XQueryParser.SEMICOLON);

        if (isExternal) {
            const kwExternal = this.kw(node.KW_EXTERNAL(), XQueryParser.KW_EXTERNAL);
            return concat([withReturn, space, kwExternal, semi]);
        }

        if (!node._fn_body) {
            return concat([withReturn, semi]);
        }

        const bodyDoc = this.v(node._fn_body);
        return concat([
            withReturn,
            space,
            formatBlockDoc(
                this.kw(node.LBRACE(), XQueryParser.LBRACE),
                bodyDoc,
                this.kw(node.RBRACE(), XQueryParser.RBRACE),
            ),
            semi,
        ]);
    };

    public override visitVarDecl = (node: ctx.VarDeclContext): Doc => {
        const decl = this.kw(node.KW_DECLARE(), XQueryParser.KW_DECLARE);
        const annotations = node.annotations() ? this.v(node.annotations()) : NIL;
        const varKw = this.kw(node.KW_VARIABLE(), XQueryParser.KW_VARIABLE);
        const name = node.varBinding() ? this.v(node.varBinding()) : NIL;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), XQueryParser.KW_AS) : null;
        const typeSeq = node.sequenceType() ? this.v(node.sequenceType()) : null;
        const expr = node.exprSingle() ? this.v(node.exprSingle()) : null;
        const isExternal = node.KW_EXTERNAL() !== null || node._external !== undefined;

        const prefix = spacedDocs(decl, annotations, varKw, name);
        const typed =
            typeSeq !== null && kwAs !== null ? spacedDocs(prefix, kwAs, typeSeq) : prefix;
        const semi = this.kw(node.SEMICOLON(), XQueryParser.SEMICOLON);

        if (isExternal) {
            const kwExternal = this.kw(node.KW_EXTERNAL(), XQueryParser.KW_EXTERNAL);
            return concat([typed, space, kwExternal, semi]);
        }

        const assign = node.COLON_EQ() ? this.kw(node.COLON_EQ(), XQueryParser.COLON_EQ) : null;
        return concat([
            typed,
            expr !== null && assign !== null ? concat([space, assign, space, expr]) : NIL,
            semi,
        ]);
    };

    public override visitParamList = (node: ctx.ParamListContext): Doc => {
        return formatCommaSeparatedDocs(node.param().map((p) => this.v(p)));
    };

    public override visitParam = (node: ctx.ParamContext): Doc => {
        const name = node.varBinding() ? this.v(node.varBinding()) : NIL;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), XQueryParser.KW_AS) : null;
        const typeSeq = node.sequenceType()
            ? concat([space, kwAs ?? text("as"), space, this.v(node.sequenceType())])
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
            return concat([pct, name, lp, formatCommaSeparatedDocs(lits), rp]);
        }
        return concat([pct, name]);
    };

    // ─── FLWOR Expressions ───────────────────────────────────────────────────

    public override visitFlworExpr = (node: ctx.FlworExprContext): Doc => {
        const clauses: Doc[] = [];
        const count = node.getChildCount();
        for (let i = 0; i < count; i++) {
            const child = node.getChild(i);
            if (child === null || child === node.KW_RETURN() || child === node._return_expr) {
                continue;
            }
            const res = this.v(child);
            if (res.kind !== "text" || res.text !== "") {
                clauses.push(res);
            }
        }
        const returnKw = this.kw(node.KW_RETURN(), XQueryParser.KW_RETURN);
        const returnExpr = node._return_expr ? this.v(node._return_expr) : NIL;
        return group(formatFlworExpressionDoc(clauses, returnKw, returnExpr));
    };

    public override visitForClause = (node: ctx.ForClauseContext): Doc => {
        const kw = this.kw(node.KW_FOR(), XQueryParser.KW_FOR);
        const vars = node._vars.map((v) => this.v(v));
        return group(concat([kw, space, formatCommaSeparatedDocs(vars)]));
    };

    public override visitForVar = (node: ctx.ForVarContext): Doc => {
        const varRef = node._var_ref ? this.v(node._var_ref) : NIL;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), XQueryParser.KW_AS) : null;
        const seq = node._seq && kwAs ? concat([space, kwAs, space, this.v(node._seq)]) : NIL;
        const kwAllowing = node.allowingEmpty() ? this.v(node.allowingEmpty()) : NIL;
        const allowingEmpty = kwAllowing !== NIL ? concat([space, kwAllowing]) : NIL;
        const kwAt = node.KW_AT() ? this.kw(node.KW_AT(), XQueryParser.KW_AT) : null;
        const at = node._at && kwAt ? concat([space, kwAt, space, this.v(node._at)]) : NIL;
        const kwIn = this.kw(node.KW_IN(), XQueryParser.KW_IN);
        const inExpr = node._ex ? this.v(node._ex) : NIL;
        return concat([varRef, seq, allowingEmpty, at, space, kwIn, space, inExpr]);
    };

    public override visitLetClause = (node: ctx.LetClauseContext): Doc => {
        const kw = this.kw(node.KW_LET(), XQueryParser.KW_LET);
        const vars = node._vars.map((v) => this.v(v));
        return group(concat([kw, space, formatCommaSeparatedDocs(vars)]));
    };

    public override visitLetVar = (node: ctx.LetVarContext): Doc => {
        const varRef = node._var_ref ? this.v(node._var_ref) : NIL;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), XQueryParser.KW_AS) : null;
        const seq = node._seq && kwAs ? concat([space, kwAs, space, this.v(node._seq)]) : NIL;
        const assign = this.kw(node.COLON_EQ(), XQueryParser.COLON_EQ);
        const expr = node._ex ? this.v(node._ex) : NIL;
        return concat([varRef, seq, space, assign, space, expr]);
    };

    public override visitWhereClause = (node: ctx.WhereClauseContext): Doc => {
        const kw = this.kw(node.KW_WHERE(), XQueryParser.KW_WHERE);
        const expr = node.exprSingle() ? this.v(node.exprSingle()) : NIL;
        return concat([kw, space, expr]);
    };

    public override visitGroupByClause = (node: ctx.GroupByClauseContext): Doc => {
        const kwGroup = this.kw(node.KW_GROUP(), XQueryParser.KW_GROUP);
        const kwBy = this.kw(node.KW_BY(), XQueryParser.KW_BY);
        const vars = node._vars.map((v) => this.v(v));
        return group(concat([kwGroup, space, kwBy, space, formatCommaSeparatedDocs(vars)]));
    };

    public override visitGroupByVar = (node: ctx.GroupByVarContext): Doc => {
        const varRef = node._var_ref ? this.v(node._var_ref) : NIL;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), XQueryParser.KW_AS) : null;
        const seq = node._seq && kwAs ? concat([space, kwAs, space, this.v(node._seq)]) : NIL;
        const assign = node.COLON_EQ() ? this.kw(node.COLON_EQ(), XQueryParser.COLON_EQ) : null;
        const expr = node._ex && assign ? concat([space, assign, space, this.v(node._ex)]) : NIL;
        return concat([varRef, seq, expr]);
    };

    public override visitOrderByClause = (node: ctx.OrderByClauseContext): Doc => {
        const specs = node._specs.map((s) => this.v(s));
        const kwStable = node.KW_STABLE()
            ? concat([this.kw(node.KW_STABLE(), XQueryParser.KW_STABLE), space])
            : NIL;
        const kwOrder = this.kw(node.KW_ORDER(), XQueryParser.KW_ORDER);
        const kwBy = this.kw(node.KW_BY(), XQueryParser.KW_BY);
        return group(
            concat([kwStable, kwOrder, space, kwBy, space, formatCommaSeparatedDocs(specs)]),
        );
    };

    public override visitCountClause = (node: ctx.CountClauseContext): Doc => {
        const kw = this.kw(node.KW_COUNT(), XQueryParser.KW_COUNT);
        const varBinding = node.varBinding() ? this.v(node.varBinding()) : NIL;
        return concat([kw, space, varBinding]);
    };

    // ─── Expressions ──────────────────────────────────────────────────────────

    public override visitExpr = (node: ctx.ExprContext): Doc => {
        return group(formatCommaSeparatedDocs(node.exprSingle().map((e) => this.v(e))));
    };

    public override visitIfExpr = (node: ctx.IfExprContext): Doc => {
        const kwIf = this.kw(node.KW_IF(), XQueryParser.KW_IF);
        const lparen = this.kw(node.LPAREN(), XQueryParser.LPAREN);
        const rparen = this.kw(node.RPAREN(), XQueryParser.RPAREN);
        const kwThen = this.kw(node.KW_THEN(), XQueryParser.KW_THEN);
        const kwElse = this.kw(node.KW_ELSE(), XQueryParser.KW_ELSE);
        const cond = node._test_condition ? this.v(node._test_condition) : NIL;
        const thenBranch = node._branch ? this.v(node._branch) : NIL;
        const elseBranch = node._else_branch ? this.v(node._else_branch) : NIL;
        return formatIfExpressionDoc(
            kwIf,
            lparen,
            cond,
            rparen,
            kwThen,
            thenBranch,
            kwElse,
            elseBranch,
        );
    };

    public override visitTryCatchExpr = (node: ctx.TryCatchExprContext): Doc => {
        const kwTry = this.kw(node.KW_TRY(), XQueryParser.KW_TRY);
        const tryExpr = node._try_expression ? this.v(node._try_expression) : NIL;
        const catches = node.catchClause().map((c) => this.v(c));
        return formatTryCatchDoc(
            kwTry,
            this.kw(node.LBRACE(), XQueryParser.LBRACE),
            tryExpr,
            this.kw(node.RBRACE(), XQueryParser.RBRACE),
            catches,
        );
    };

    public override visitCatchClause = (node: ctx.CatchClauseContext): Doc => {
        const kwCatch = this.kw(node.KW_CATCH(), XQueryParser.KW_CATCH);
        const catchExpr = node._catch_expression ? this.v(node._catch_expression) : NIL;
        let catchTarget: Doc = NIL;
        if (node._catch_var) {
            const lp = this.kw(node.LPAREN(), XQueryParser.LPAREN);
            const rp = this.kw(node.RPAREN(), XQueryParser.RPAREN);
            catchTarget = concat([space, lp, this.v(node._catch_var), rp]);
        } else {
            const targets: Doc[] = [];
            if (node._jokers && node._jokers.length > 0) {
                for (const j of node._jokers) {
                    targets.push(this.v(j));
                }
            }
            if (node._errors && node._errors.length > 0) {
                for (const e of node._errors) {
                    targets.push(this.v(e));
                }
            }
            if (targets.length > 0) {
                const vbar = this.kw(node.VBAR(), XQueryParser.VBAR);
                catchTarget = concat([space, join(concat([space, vbar, space]), targets)]);
            }
        }
        const body = formatBlockDoc(
            this.kw(node.LBRACE(), XQueryParser.LBRACE),
            catchExpr,
            this.kw(node.RBRACE(), XQueryParser.RBRACE),
        );
        return concat([kwCatch, catchTarget, space, body]);
    };

    public override visitSwitchExpr = (node: ctx.SwitchExprContext): Doc => {
        const kwSwitch = this.kw(node.KW_SWITCH(), XQueryParser.KW_SWITCH);
        const lp = this.kw(node.LPAREN(), XQueryParser.LPAREN);
        const rp = this.kw(node.RPAREN(), XQueryParser.RPAREN);
        const cond = node._cond ? this.v(node._cond) : NIL;
        const cases = node.switchCaseClause().map((c) => this.v(c));
        const kwDefault = this.kw(node.KW_DEFAULT(), XQueryParser.KW_DEFAULT);
        const kwReturn = this.kw(node.KW_RETURN(), XQueryParser.KW_RETURN);
        const defExpr = node._def ? this.v(node._def) : NIL;
        const defaultClause = group(
            concat([kwDefault, space, kwReturn, space, indent(concat([softline, defExpr]))]),
        );
        return group(
            concat([
                kwSwitch,
                space,
                lp,
                cond,
                rp,
                indent(concat([hardline, join(hardline, cases), hardline, defaultClause])),
            ]),
        );
    };

    public override visitSwitchCaseClause = (node: ctx.SwitchCaseClauseContext): Doc => {
        const cases = node.KW_CASE();
        const conds = node._cond ? node._cond.map((c) => this.v(c)) : [];
        const retExpr = node._ret ? this.v(node._ret) : NIL;
        const caseParts: Doc[] = [];
        for (let i = 0; i < conds.length; i++) {
            const kw = this.kw(cases[i] ?? null, XQueryParser.KW_CASE);
            caseParts.push(concat([kw, space, conds[i]!]));
        }
        const kwReturn = this.kw(node.KW_RETURN(), XQueryParser.KW_RETURN);
        const caseHeader = join(space, caseParts);
        return group(
            concat([caseHeader, space, kwReturn, space, indent(concat([softline, retExpr]))]),
        );
    };

    public override visitTypeswitchExpr = (node: ctx.TypeswitchExprContext): Doc => {
        const kwTypeswitch = this.kw(node.KW_TYPESWITCH(), XQueryParser.KW_TYPESWITCH);
        const lp = this.kw(node.LPAREN(), XQueryParser.LPAREN);
        const rp = this.kw(node.RPAREN(), XQueryParser.RPAREN);
        const cond = node._cond ? this.v(node._cond) : NIL;
        const cases = node.caseClause().map((c) => this.v(c));
        const kwDefault = this.kw(node.KW_DEFAULT(), XQueryParser.KW_DEFAULT);
        const defVar = node._var_ref ? concat([space, this.v(node._var_ref)]) : NIL;
        const kwReturn = this.kw(node.KW_RETURN(), XQueryParser.KW_RETURN);
        const defExpr = node._def ? this.v(node._def) : NIL;
        const defaultClause = group(
            concat([
                kwDefault,
                defVar,
                space,
                kwReturn,
                space,
                indent(concat([softline, defExpr])),
            ]),
        );
        return group(
            concat([
                kwTypeswitch,
                space,
                lp,
                cond,
                rp,
                indent(concat([hardline, join(hardline, cases), hardline, defaultClause])),
            ]),
        );
    };

    public override visitCaseClause = (node: ctx.CaseClauseContext): Doc => {
        const kwCase = this.kw(node.KW_CASE(), XQueryParser.KW_CASE);
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), XQueryParser.KW_AS) : null;
        const varRef =
            node._var_ref && kwAs ? concat([this.v(node._var_ref), space, kwAs, space]) : NIL;
        const unions = node._union ? node._union.map((u) => this.v(u)) : [];
        const vbar = this.kw(node.VBAR(), XQueryParser.VBAR);
        const unionTypes = join(concat([space, vbar, space]), unions);
        const kwReturn = this.kw(node.KW_RETURN(), XQueryParser.KW_RETURN);
        const retExpr = node._ret ? this.v(node._ret) : NIL;
        return group(
            concat([
                kwCase,
                space,
                varRef,
                unionTypes,
                space,
                kwReturn,
                space,
                indent(concat([softline, retExpr])),
            ]),
        );
    };

    // ─── Maps & Arrays (XQuery 3.1) ───────────────────────────────────────────

    public override visitObjectConstructor = (node: ctx.ObjectConstructorContext): Doc => {
        const kwMap = this.token(node.KW_MAP(), XQueryParser.KW_MAP);
        const lb = this.kw(node.LBRACE(), XQueryParser.LBRACE);
        const rb = this.kw(node.RBRACE(), XQueryParser.RBRACE);
        const pairs = node.pairConstructor().map((p) => this.v(p));
        if (pairs.length === 0) {
            return concat([composeTokenDoc(kwMap), space, lb, rb]);
        }

        if (pairs.length > 2) {
            return concat([
                composeTokenDoc(kwMap),
                space,
                lb,
                indent(concat([hardline, join(concat([text(","), hardline]), pairs)])),
                hardline,
                rb,
            ]);
        }

        return groupStartingWith(
            kwMap,
            concat([
                space,
                lb,
                indent(concat([line, join(concat([text(","), line]), pairs)])),
                line,
                rb,
            ]),
        );
    };

    public override visitPairConstructor = (node: ctx.PairConstructorContext): Doc => {
        const lhs = node._lhs ? this.v(node._lhs) : NIL;
        const colon = this.kw(node.COLON(), XQueryParser.COLON);
        const rhs = node._rhs ? this.v(node._rhs) : NIL;
        return concat([lhs, colon, space, rhs]);
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
                indent(concat([line, join(concat([text(","), line]), items)])),
                line,
                rbracket,
            ]),
        );
    };

    public override visitCurlyArrayConstructor = (node: ctx.CurlyArrayConstructorContext): Doc => {
        const kwArray = this.kw(node.KW_ARRAY(), XQueryParser.KW_ARRAY);
        const enclosed = node.enclosedExpression() ? this.v(node.enclosedExpression()) : text("{}");
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
        const lb = this.kw(node.LBRACKET(), XQueryParser.LBRACKET);
        const rb = this.kw(node.RBRACKET(), XQueryParser.RBRACKET);
        const expr = node.expr() ? this.v(node.expr()) : NIL;
        return concat([lb, expr, rb]);
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
                    indent(concat([softline, join(concat([text(","), line]), items)])),
                    softline,
                    rp,
                ]),
            ),
        ]);
    };

    public override visitFunctionCall = (node: ctx.FunctionCallContext): Doc => {
        const fnName = node._fn_name ? this.v(node._fn_name) : NIL;
        const args = node.argumentList() ? this.v(node.argumentList()) : text("()");
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
                    indent(concat([softline, join(concat([text(","), line]), args)])),
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
        const dollar = this.kw(node.DOLLAR(), XQueryParser.DOLLAR);
        const name = node._var_name ? this.v(node._var_name) : NIL;
        return concat([dollar, name]);
    };

    public override visitVarBinding = (node: ctx.VarBindingContext): Doc => {
        const dollar = this.kw(node.DOLLAR(), XQueryParser.DOLLAR);
        const name = node._var_name ? this.v(node._var_name) : NIL;
        return concat([dollar, name]);
    };

    public override visitEnclosedExpression = (node: ctx.EnclosedExpressionContext): Doc => {
        const expr = node.expr() ? this.v(node.expr()) : NIL;
        return formatBlockDoc(
            this.kw(node.LBRACE(), XQueryParser.LBRACE),
            expr,
            this.kw(node.RBRACE(), XQueryParser.RBRACE),
        );
    };

    public override visitSequenceType = (node: ctx.SequenceTypeContext): Doc => {
        if (node.KW_EMPTY_SEQUENCE()) {
            const kw = this.kw(node.KW_EMPTY_SEQUENCE(), XQueryParser.KW_EMPTY_SEQUENCE);
            const lp = this.kw(node.LPAREN(), XQueryParser.LPAREN);
            const rp = this.kw(node.RPAREN(), XQueryParser.RPAREN);
            return concat([kw, lp, rp]);
        }
        const item = node._item ? this.v(node._item) : NIL;
        let occurrenceDoc: Doc = NIL;
        if (node._question && node._question.length > 0) {
            occurrenceDoc = this.kw(node.QUESTION(), XQueryParser.QUESTION);
        } else if (node._star && node._star.length > 0) {
            occurrenceDoc = this.kw(node.STAR(), XQueryParser.STAR);
        } else if (node._plus && node._plus.length > 0) {
            occurrenceDoc = this.kw(node.PLUS(), XQueryParser.PLUS);
        }
        return concat([item, occurrenceDoc]);
    };
}

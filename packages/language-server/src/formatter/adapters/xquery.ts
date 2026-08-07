import { ParseTree, TerminalNode } from "antlr4ng";
import { FormatterContext } from "server/formatter/context.js";
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
    spacedDocs,
    text,
} from "server/formatter/doc.js";
import {
    formatBlockDoc,
    formatCommaSeparatedDocs,
    formatFlworExpressionDoc,
    formatIfExpressionDoc,
    formatTryCatchDoc,
    shouldSeparateDeclarations,
} from "server/formatter/helpers.js";
import { printDocToString } from "server/formatter/printer.js";
import type * as ctx from "server/parser/adapters/xquery/grammar/XQueryParser.js";
import { XQueryParserVisitor } from "server/parser/adapters/xquery/grammar/XQueryParserVisitor.js";

export class XQueryFormatterVisitor extends XQueryParserVisitor<Doc> {
    public constructor(private readonly ctx: FormatterContext) {
        super();
    }

    private v = (child: ParseTree | null | undefined): Doc => {
        if (child === null || child === undefined) {
            return NIL;
        }
        if ("accept" in child && typeof child.accept === "function") {
            return child.accept(this) ?? NIL;
        }
        return NIL;
    };

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
        return concat([aggregate, text(" "), nextResult]);
    }

    public override visitTerminal = (node: TerminalNode): Doc => {
        if (node.symbol.type === -1 /* Token.EOF */ || node.getText() === "<EOF>") {
            return NIL;
        }
        return this.ctx.formatTokenDoc(node.symbol.tokenIndex, node.getText());
    };

    public override visitStringLiteral = (node: ctx.StringLiteralContext): Doc => {
        if (node.start !== null) {
            return this.ctx.formatTokenDoc(node.start.tokenIndex, node.getText());
        }
        return text(node.getText());
    };

    public override visitUriLiteral = (node: ctx.UriLiteralContext): Doc => {
        if (node.start !== null) {
            return this.ctx.formatTokenDoc(node.start.tokenIndex, node.getText());
        }
        return text(node.getText());
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
            const kwXquery = this.v(node.KW_XQUERY());
            const kwVer = node.KW_VERSION() ? this.v(node.KW_VERSION()) : text("version");
            const versionStr = node._vers ? this.v(node._vers) : NIL;
            const encStr = node._encoding
                ? concat([text(" encoding "), this.v(node._encoding)])
                : NIL;
            const semi = text(";");
            parts.push(concat([kwXquery, text(" "), kwVer, text(" "), versionStr, encStr, semi]));
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
        const ncName = node.ncName() ? this.v(node.ncName()) : NIL;
        const uri = node._uri ? this.v(node._uri) : NIL;
        const prolog = node.prolog() ? this.v(node.prolog()) : NIL;
        const header = concat([text("module namespace "), ncName, text(" = "), uri, text(";")]);
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
        const decl = node.KW_DECLARE() ? this.v(node.KW_DECLARE()) : text("declare");
        const annotations = node.annotations() ? this.v(node.annotations()) : NIL;
        const fnKw = node.KW_FUNCTION() ? this.v(node.KW_FUNCTION()) : text("function");
        const name = node.functionName() ? this.v(node.functionName()) : NIL;
        const params = node.paramList()
            ? concat([text("("), this.v(node.paramList()), text(")")])
            : text("()");
        const returnType = node._return_type ? this.v(node._return_type) : null;
        const isExternal = node.KW_EXTERNAL() !== null || node._is_external !== undefined;

        const signature = spacedDocs(decl, annotations, fnKw, concat([name, params]));
        const withReturn =
            returnType !== null ? spacedDocs(signature, text("as"), returnType) : signature;

        const semi = node.stop ? this.ctx.formatTokenDoc(node.stop.tokenIndex, ";") : text(";");

        if (isExternal) {
            return concat([withReturn, text(" external"), semi]);
        }

        if (!node._fn_body) {
            return concat([withReturn, semi]);
        }

        const bodyDoc = this.v(node._fn_body);
        return concat([withReturn, text(" "), formatBlockDoc(bodyDoc), semi]);
    };

    public override visitVarDecl = (node: ctx.VarDeclContext): Doc => {
        const decl = node.KW_DECLARE() ? this.v(node.KW_DECLARE()) : text("declare");
        const annotations = node.annotations() ? this.v(node.annotations()) : NIL;
        const varKw = node.KW_VARIABLE() ? this.v(node.KW_VARIABLE()) : text("variable");
        const name = node.varBinding() ? this.v(node.varBinding()) : NIL;
        const typeSeq = node.sequenceType() ? this.v(node.sequenceType()) : null;
        const expr = node.exprSingle() ? this.v(node.exprSingle()) : null;
        const isExternal = node.KW_EXTERNAL() !== null || node._external !== undefined;

        const prefix = spacedDocs(decl, annotations, varKw, name);
        const typed = typeSeq !== null ? spacedDocs(prefix, text("as"), typeSeq) : prefix;
        const semi = node.SEMICOLON() ? this.v(node.SEMICOLON()) : text(";");

        if (isExternal) {
            return concat([typed, text(" external"), semi]);
        }

        return concat([typed, expr !== null ? concat([text(" := "), expr]) : NIL, semi]);
    };

    public override visitParamList = (node: ctx.ParamListContext): Doc => {
        return formatCommaSeparatedDocs(node.param().map((p) => this.v(p)));
    };

    public override visitParam = (node: ctx.ParamContext): Doc => {
        const name = node.varBinding() ? this.v(node.varBinding()) : NIL;
        const typeSeq = node.sequenceType()
            ? concat([text(" as "), this.v(node.sequenceType())])
            : NIL;
        return concat([name, typeSeq]);
    };

    public override visitAnnotations = (node: ctx.AnnotationsContext): Doc => {
        return join(
            text(" "),
            node.annotation().map((a) => this.v(a)),
        );
    };

    public override visitAnnotation = (node: ctx.AnnotationContext): Doc => {
        const name = node._name ? this.v(node._name) : NIL;
        const lits = node.literal().map((l) => this.v(l));
        return lits.length > 0
            ? concat([text("%"), name, text("("), formatCommaSeparatedDocs(lits), text(")")])
            : concat([text("%"), name]);
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
        const returnKw = node.KW_RETURN() ? this.v(node.KW_RETURN()) : text("return");
        const returnExpr = node._return_expr ? this.v(node._return_expr) : NIL;
        return group(formatFlworExpressionDoc(clauses, returnKw, returnExpr));
    };

    public override visitForClause = (node: ctx.ForClauseContext): Doc => {
        const kw = node.KW_FOR() ? this.v(node.KW_FOR()) : text("for");
        const vars = node._vars.map((v) => this.v(v));
        return group(concat([kw, text(" "), formatCommaSeparatedDocs(vars)]));
    };

    public override visitForVar = (node: ctx.ForVarContext): Doc => {
        const varRef = node._var_ref ? this.v(node._var_ref) : NIL;
        const seq = node._seq ? concat([text(" as "), this.v(node._seq)]) : NIL;
        const allowingEmpty = node.allowingEmpty() ? text(" allowing empty") : NIL;
        const at = node._at ? concat([text(" at "), this.v(node._at)]) : NIL;
        const inExpr = node._ex ? this.v(node._ex) : NIL;
        return concat([varRef, seq, allowingEmpty, at, text(" in "), inExpr]);
    };

    public override visitLetClause = (node: ctx.LetClauseContext): Doc => {
        const kw = node.KW_LET() ? this.v(node.KW_LET()) : text("let");
        const vars = node._vars.map((v) => this.v(v));
        return group(concat([kw, text(" "), formatCommaSeparatedDocs(vars)]));
    };

    public override visitLetVar = (node: ctx.LetVarContext): Doc => {
        const varRef = node._var_ref ? this.v(node._var_ref) : NIL;
        const seq = node._seq ? concat([text(" as "), this.v(node._seq)]) : NIL;
        const expr = node._ex ? this.v(node._ex) : NIL;
        return concat([varRef, seq, text(" := "), expr]);
    };

    public override visitWhereClause = (node: ctx.WhereClauseContext): Doc => {
        const kw = node.KW_WHERE() ? this.v(node.KW_WHERE()) : text("where");
        const expr = node.exprSingle() ? this.v(node.exprSingle()) : NIL;
        return concat([kw, text(" "), expr]);
    };

    public override visitGroupByClause = (node: ctx.GroupByClauseContext): Doc => {
        const vars = node._vars.map((v) => this.v(v));
        return group(concat([text("group by "), formatCommaSeparatedDocs(vars)]));
    };

    public override visitGroupByVar = (node: ctx.GroupByVarContext): Doc => {
        const varRef = node._var_ref ? this.v(node._var_ref) : NIL;
        const seq = node._seq ? concat([text(" as "), this.v(node._seq)]) : NIL;
        const expr = node._ex ? concat([text(" := "), this.v(node._ex)]) : NIL;
        return concat([varRef, seq, expr]);
    };

    public override visitOrderByClause = (node: ctx.OrderByClauseContext): Doc => {
        const specs = node._specs.map((s) => this.v(s));
        const stable = node.KW_STABLE() ? text("stable ") : NIL;
        return group(concat([stable, text("order by "), formatCommaSeparatedDocs(specs)]));
    };

    public override visitCountClause = (node: ctx.CountClauseContext): Doc => {
        const varBinding = node.varBinding() ? this.v(node.varBinding()) : NIL;
        return concat([text("count "), varBinding]);
    };

    // ─── Expressions ──────────────────────────────────────────────────────────

    public override visitExpr = (node: ctx.ExprContext): Doc => {
        return group(formatCommaSeparatedDocs(node.exprSingle().map((e) => this.v(e))));
    };

    public override visitIfExpr = (node: ctx.IfExprContext): Doc => {
        const kwIf = node.KW_IF() ? this.v(node.KW_IF()) : text("if");
        const cond = node._test_condition ? this.v(node._test_condition) : NIL;
        const thenBranch = node._branch ? this.v(node._branch) : NIL;
        const elseBranch = node._else_branch ? this.v(node._else_branch) : NIL;
        return formatIfExpressionDoc(kwIf, cond, thenBranch, elseBranch);
    };

    public override visitTryCatchExpr = (node: ctx.TryCatchExprContext): Doc => {
        const kwTry = node.KW_TRY() ? this.v(node.KW_TRY()) : text("try");
        const tryExpr = node._try_expression ? this.v(node._try_expression) : NIL;
        const catches = node.catchClause().map((c) => this.v(c));
        return formatTryCatchDoc(kwTry, tryExpr, catches);
    };

    public override visitCatchClause = (node: ctx.CatchClauseContext): Doc => {
        const kwCatch = node.KW_CATCH() ? this.v(node.KW_CATCH()) : text("catch");
        const catchExpr = node._catch_expression ? this.v(node._catch_expression) : NIL;
        let catchTarget: Doc = NIL;
        if (node._catch_var) {
            catchTarget = concat([text(" ("), this.v(node._catch_var), text(")")]);
        } else {
            const targets: Doc[] = [];
            const nAny = node as any;
            if (nAny.errors && Array.isArray(nAny.errors)) {
                for (const e of nAny.errors) {
                    targets.push(this.v(e));
                }
            }
            if (nAny.jokers && Array.isArray(nAny.jokers)) {
                for (const j of nAny.jokers) {
                    targets.push(this.v(j));
                }
            }
            if (targets.length > 0) {
                catchTarget = concat([text(" "), join(text(" | "), targets)]);
            }
        }
        const body = formatBlockDoc(catchExpr);
        return concat([kwCatch, catchTarget, text(" "), body]);
    };

    public override visitSwitchExpr = (node: ctx.SwitchExprContext): Doc => {
        const kwSwitch = node.KW_SWITCH() ? this.v(node.KW_SWITCH()) : text("switch");
        const cond = node._cond ? this.v(node._cond) : NIL;
        const cases = node.switchCaseClause().map((c) => this.v(c));
        const defExpr = node._def ? this.v(node._def) : NIL;
        const defaultClause = group(
            concat([text("default return "), indent(concat([softline, defExpr]))]),
        );
        return group(
            concat([
                kwSwitch,
                text(" ("),
                cond,
                text(")"),
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
            const kw = cases[i] ? this.v(cases[i]!) : text("case");
            caseParts.push(concat([kw, text(" "), conds[i]!]));
        }
        const caseHeader = join(text(" "), caseParts);
        return group(concat([caseHeader, text(" return "), indent(concat([softline, retExpr]))]));
    };

    public override visitTypeswitchExpr = (node: ctx.TypeswitchExprContext): Doc => {
        const kwTypeswitch = node.KW_TYPESWITCH()
            ? this.v(node.KW_TYPESWITCH())
            : text("typeswitch");
        const cond = node._cond ? this.v(node._cond) : NIL;
        const cases = node.caseClause().map((c) => this.v(c));
        const defVar = node._var_ref ? concat([text(" "), this.v(node._var_ref)]) : NIL;
        const defExpr = node._def ? this.v(node._def) : NIL;
        const defaultClause = group(
            concat([
                text("default"),
                defVar,
                text(" return "),
                indent(concat([softline, defExpr])),
            ]),
        );
        return group(
            concat([
                kwTypeswitch,
                text(" ("),
                cond,
                text(")"),
                indent(concat([hardline, join(hardline, cases), hardline, defaultClause])),
            ]),
        );
    };

    public override visitCaseClause = (node: ctx.CaseClauseContext): Doc => {
        const kwCase = node.KW_CASE() ? this.v(node.KW_CASE()) : text("case");
        const varRef = node._var_ref ? concat([this.v(node._var_ref), text(" as ")]) : NIL;
        const unions = node._union ? node._union.map((u) => this.v(u)) : [];
        const unionTypes = join(text(" | "), unions);
        const retExpr = node._ret ? this.v(node._ret) : NIL;
        return group(
            concat([
                kwCase,
                text(" "),
                varRef,
                unionTypes,
                text(" return "),
                indent(concat([softline, retExpr])),
            ]),
        );
    };

    // ─── Maps & Arrays (XQuery 3.1) ───────────────────────────────────────────

    public override visitObjectConstructor = (node: ctx.ObjectConstructorContext): Doc => {
        const pairs = node.pairConstructor().map((p) => this.v(p));
        if (pairs.length === 0) {
            return text("map {}");
        }

        if (pairs.length > 2) {
            return concat([
                text("map {"),
                indent(concat([hardline, join(concat([text(","), hardline]), pairs)])),
                hardline,
                text("}"),
            ]);
        }

        return group(
            concat([
                text("map {"),
                indent(concat([line, join(concat([text(","), line]), pairs)])),
                line,
                text("}"),
            ]),
        );
    };

    public override visitPairConstructor = (node: ctx.PairConstructorContext): Doc => {
        const lhs = node._lhs ? this.v(node._lhs) : NIL;
        const rhs = node._rhs ? this.v(node._rhs) : NIL;
        return concat([lhs, text(": "), rhs]);
    };

    public override visitSquareArrayConstructor = (
        node: ctx.SquareArrayConstructorContext,
    ): Doc => {
        const exprSingles = node.exprSingle();
        if (exprSingles.length === 0) {
            return text("[]");
        }

        if (exprSingles.length === 1) {
            const itemStr = this.vStrDoc(this.v(exprSingles[0]));
            if (
                (itemStr.startsWith("for ") || itemStr.startsWith("let ")) &&
                !/\b(where|let|for|order|group)\b/.test(itemStr.slice(4))
            ) {
                const single = itemStr.replace(/\n\s*/g, " ");
                return text(`[ ${single} ]`);
            }
        }

        const items = exprSingles.map((e) => this.v(e));
        return group(
            concat([
                text("["),
                indent(concat([line, join(concat([text(","), line]), items)])),
                line,
                text("]"),
            ]),
        );
    };

    public override visitCurlyArrayConstructor = (node: ctx.CurlyArrayConstructorContext): Doc => {
        const enclosed = node.enclosedExpression() ? this.v(node.enclosedExpression()) : text("{}");
        return concat([text("array "), enclosed]);
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
        const expr = node.expr() ? this.v(node.expr()) : NIL;
        return concat([text("["), expr, text("]")]);
    };

    public override visitContextItemExpr = (_node: ctx.ContextItemExprContext): Doc => {
        return text(".");
    };

    // ─── Primary & Miscellaneous ──────────────────────────────────────────────

    public override visitParenthesizedExpr = (node: ctx.ParenthesizedExprContext): Doc => {
        const exprNode = node.expr();

        const openIdx = node.start?.tokenIndex;
        const closeIdx = node.stop?.tokenIndex;
        const openLeadingDoc = openIdx != null ? this.ctx.flushLeadingDoc(openIdx) : NIL;
        const openTrailingDoc = openIdx != null ? this.ctx.flushTrailingDoc(openIdx) : NIL;
        const closeTrailingDoc = closeIdx != null ? this.ctx.flushTrailingDoc(closeIdx) : NIL;

        if (!exprNode) {
            return concat([openLeadingDoc, text("()"), openTrailingDoc, closeTrailingDoc]);
        }

        let items: Doc[];
        if ("exprSingle" in exprNode && typeof exprNode.exprSingle === "function") {
            items = (exprNode as ctx.ExprContext).exprSingle().map((e) => this.v(e));
        } else {
            items = [this.v(exprNode)];
        }

        return concat([
            openLeadingDoc,
            group(
                concat([
                    text("("),
                    openTrailingDoc,
                    indent(concat([softline, join(concat([text(","), line]), items)])),
                    softline,
                    text(")"),
                    closeTrailingDoc,
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
        const openIdx = node.start?.tokenIndex;
        const closeIdx = node.stop?.tokenIndex;
        const openLeadingDoc = openIdx != null ? this.ctx.flushLeadingDoc(openIdx) : NIL;
        const openTrailingDoc = openIdx != null ? this.ctx.flushTrailingDoc(openIdx) : NIL;
        const closeTrailingDoc = closeIdx != null ? this.ctx.flushTrailingDoc(closeIdx) : NIL;

        const args = node.argument().map((a) => this.v(a));
        if (args.length === 0) {
            return concat([openLeadingDoc, text("()"), openTrailingDoc, closeTrailingDoc]);
        }

        return concat([
            openLeadingDoc,
            group(
                concat([
                    text("("),
                    openTrailingDoc,
                    indent(concat([softline, join(concat([text(","), line]), args)])),
                    softline,
                    text(")"),
                    closeTrailingDoc,
                ]),
            ),
        ]);
    };

    public override visitArgument = (node: ctx.ArgumentContext): Doc => {
        if (node.QUESTION() !== null) {
            return text("?");
        }
        return node.exprSingle() ? this.v(node.exprSingle()) : NIL;
    };

    public override visitVarRef = (node: ctx.VarRefContext): Doc => {
        const name = node._var_name ? this.v(node._var_name) : NIL;
        return concat([text("$"), name]);
    };

    public override visitVarBinding = (node: ctx.VarBindingContext): Doc => {
        const name = node._var_name ? this.v(node._var_name) : NIL;
        return concat([text("$"), name]);
    };

    public override visitEnclosedExpression = (node: ctx.EnclosedExpressionContext): Doc => {
        const expr = node.expr() ? this.v(node.expr()) : NIL;
        return formatBlockDoc(expr);
    };

    public override visitSequenceType = (node: ctx.SequenceTypeContext): Doc => {
        if (node.KW_EMPTY_SEQUENCE()) {
            return text("empty-sequence()");
        }
        const item = node._item ? this.v(node._item) : NIL;
        const occurrence =
            node._question && node._question.length > 0
                ? "?"
                : node._star && node._star.length > 0
                  ? "*"
                  : node._plus && node._plus.length > 0
                    ? "+"
                    : "";
        return concat([item, text(occurrence)]);
    };
}

export function createXQueryFormatterVisitor(ctx: FormatterContext): XQueryFormatterVisitor {
    return new XQueryFormatterVisitor(ctx);
}

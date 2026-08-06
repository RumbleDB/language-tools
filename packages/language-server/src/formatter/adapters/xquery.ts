import type { ParseTree, TerminalNode } from "antlr4ng";
import { FormatterContext } from "server/formatter/context.js";
import {
    formatBlock,
    formatCommaSeparated,
    formatFlworExpression,
    formatFunctionDecl,
    formatIfExpression,
    formatTryCatch,
    formatVarDecl,
    smartJoin,
    spaced,
} from "server/formatter/helpers.js";
import type * as ctx from "server/parser/adapters/xquery/grammar/XQueryParser.js";
import { XQueryParserVisitor } from "server/parser/adapters/xquery/grammar/XQueryParserVisitor.js";

export class XQueryFormatterVisitor extends XQueryParserVisitor<string> {
    public constructor(private readonly ctx: FormatterContext) {
        super();
    }

    private v = (child: ParseTree | null | undefined): string => {
        if (child === null || child === undefined) {
            return "";
        }
        return this.visit(child) ?? "";
    };

    protected override defaultResult(): string {
        return "";
    }

    protected override aggregateResult(aggregate: string, nextResult: string): string {
        return smartJoin([aggregate, nextResult].filter(Boolean));
    }

    public override visitTerminal = (node: TerminalNode): string => {
        if (node.symbol.type === -1 /* Token.EOF */ || node.getText() === "<EOF>") {
            return "";
        }
        return node.getText();
    };

    public override visitStringLiteral = (node: ctx.StringLiteralContext): string => {
        return node.getText();
    };

    public override visitUriLiteral = (node: ctx.UriLiteralContext): string => {
        return node.getText();
    };

    // ─── Module & Prolog ──────────────────────────────────────────────────────

    public override visitModuleAndThisIsIt = (node: ctx.ModuleAndThisIsItContext): string => {
        return this.visitChildren(node) ?? "";
    };

    public override visitModule = (node: ctx.ModuleContext): string => {
        const parts: string[] = [];
        if (node.KW_XQUERY() !== null) {
            const versionStr = node._vers ? this.v(node._vers) : "";
            const encStr = node._encoding ? ` encoding ${this.v(node._encoding)}` : "";
            parts.push(`xquery version ${versionStr}${encStr};`);
        }
        if (node.libraryModule()) {
            parts.push(this.v(node.libraryModule()));
        } else if (node.mainModule().length > 0) {
            parts.push(
                node
                    .mainModule()
                    .map((m) => this.v(m))
                    .join(";\n"),
            );
        }
        return parts.join("\n\n");
    };

    public override visitLibraryModule = (node: ctx.LibraryModuleContext): string => {
        const ncName = node.ncName() ? this.v(node.ncName()) : "";
        const uri = node._uri ? this.v(node._uri) : "";
        const prolog = node.prolog() ? this.v(node.prolog()) : "";
        const header = `module namespace ${ncName} = ${uri};`;
        return prolog ? `${header}\n\n${prolog}` : header;
    };

    public override visitMainModule = (node: ctx.MainModuleContext): string => {
        const prolog = node.prolog() ? this.v(node.prolog()) : "";
        const program = node.program() ? this.v(node.program()) : "";
        if (prolog && program) {
            return `${prolog}\n\n${program}`;
        }
        return prolog || program;
    };

    public override visitProlog = (node: ctx.PrologContext): string => {
        const parts: string[] = [];
        const count = node.getChildCount();
        for (let i = 0; i < count; i++) {
            const child = node.getChild(i);
            if (child !== null) {
                const res = this.v(child);
                if (res) {
                    parts.push(res);
                }
            }
        }
        return parts.join("\n\n");
    };

    // ─── Declarations ─────────────────────────────────────────────────────────

    public override visitFunctionDecl = (node: ctx.FunctionDeclContext): string => {
        const annotations = node.annotations() ? this.v(node.annotations()) : "";
        const name = node.functionName() ? this.v(node.functionName()) : "";
        const params = node.paramList() ? `(${this.v(node.paramList())})` : "()";
        const returnType = node._return_type ? this.v(node._return_type) : null;
        const isExternal = node.KW_EXTERNAL() !== null || node._is_external !== undefined;

        if (isExternal || !node._fn_body) {
            return formatFunctionDecl(
                annotations,
                name,
                params,
                returnType,
                null,
                isExternal,
                this.ctx,
            );
        }

        this.ctx.indent();
        const body = this.v(node._fn_body);
        this.ctx.dedent();

        const signature = spaced("declare", annotations, "function", name + params);
        const withReturn = returnType !== null ? spaced(signature, "as", returnType) : signature;

        if (
            !body.includes("\n") &&
            withReturn.length + body.length + 5 <= this.ctx.options.maxLineWidth
        ) {
            return `${withReturn} { ${body.trim()} };`;
        }

        return `${withReturn} {\n${body}\n${this.ctx.currentIndent}};`;
    };

    public override visitVarDecl = (node: ctx.VarDeclContext): string => {
        const annotations = node.annotations() ? this.v(node.annotations()) : "";
        const name = node.varBinding() ? this.v(node.varBinding()) : "";
        const typeSeq = node.sequenceType() ? this.v(node.sequenceType()) : null;
        const expr = node.exprSingle() ? this.v(node.exprSingle()) : null;
        const isExternal = node.KW_EXTERNAL() !== null || node._external !== undefined;

        return formatVarDecl(annotations, name, typeSeq, expr, isExternal, null);
    };

    public override visitParamList = (node: ctx.ParamListContext): string => {
        return formatCommaSeparated(node.param().map((p) => this.v(p)));
    };

    public override visitParam = (node: ctx.ParamContext): string => {
        const name = node._name ? this.v(node._name) : "";
        const type = node.sequenceType() ? this.v(node.sequenceType()) : "";
        return type ? `${name} as ${type}` : name;
    };

    public override visitAnnotations = (node: ctx.AnnotationsContext): string => {
        return smartJoin(node.annotation().map((a) => this.v(a)));
    };

    public override visitAnnotation = (node: ctx.AnnotationContext): string => {
        if (node.KW_UPDATING() !== null || node._updating !== undefined) {
            return "%updating";
        }
        const name = node._name ? this.v(node._name) : "";
        const lits = node.literal().map((l) => this.v(l));
        return lits.length > 0 ? `%${name}(${formatCommaSeparated(lits)})` : `%${name}`;
    };

    // ─── FLWOR Expressions ───────────────────────────────────────────────────

    public override visitFlworExpr = (node: ctx.FlworExprContext): string => {
        const clauses: string[] = [];
        const count = node.getChildCount();
        for (let i = 0; i < count; i++) {
            const child = node.getChild(i);
            if (child === null || child === node.KW_RETURN() || child === node._return_expr) {
                continue;
            }
            const text = this.v(child);
            if (text) {
                clauses.push(text);
            }
        }
        const returnExpr = node._return_expr ? this.v(node._return_expr) : "";
        return formatFlworExpression(clauses, "return", returnExpr, this.ctx);
    };

    public override visitForClause = (node: ctx.ForClauseContext): string => {
        const vars = node._vars.map((v) => this.v(v));
        return `for ${formatCommaSeparated(vars)}`;
    };

    public override visitForVar = (node: ctx.ForVarContext): string => {
        const varRef = node._var_ref ? this.v(node._var_ref) : "";
        const seq = node._seq ? ` as ${this.v(node._seq)}` : "";
        const allowingEmpty = node.allowingEmpty() ? " allowing empty" : "";
        const at = node._at ? ` at ${this.v(node._at)}` : "";
        const inExpr = node._ex ? this.v(node._ex) : "";
        return `${varRef}${seq}${allowingEmpty}${at} in ${inExpr}`;
    };

    public override visitLetClause = (node: ctx.LetClauseContext): string => {
        const vars = node._vars.map((v) => this.v(v));
        return `let ${formatCommaSeparated(vars)}`;
    };

    public override visitLetVar = (node: ctx.LetVarContext): string => {
        const varRef = node._var_ref ? this.v(node._var_ref) : "";
        const seq = node._seq ? ` as ${this.v(node._seq)}` : "";
        const expr = node._ex ? this.v(node._ex) : "";
        return `${varRef}${seq} := ${expr}`;
    };

    public override visitWhereClause = (node: ctx.WhereClauseContext): string => {
        const expr = node.exprSingle() ? this.v(node.exprSingle()) : "";
        return `where ${expr}`;
    };

    public override visitGroupByClause = (node: ctx.GroupByClauseContext): string => {
        const vars = node._vars.map((v) => this.v(v));
        return `group by ${formatCommaSeparated(vars)}`;
    };

    public override visitGroupByVar = (node: ctx.GroupByVarContext): string => {
        const varRef = node._var_ref ? this.v(node._var_ref) : "";
        const seq = node._seq ? ` as ${this.v(node._seq)}` : "";
        const expr = node._ex ? ` := ${this.v(node._ex)}` : "";
        return `${varRef}${seq}${expr}`;
    };

    public override visitOrderByClause = (node: ctx.OrderByClauseContext): string => {
        const specs = node._specs.map((s) => this.v(s));
        const stable = node.KW_STABLE() ? "stable " : "";
        return `${stable}order by ${formatCommaSeparated(specs)}`;
    };

    public override visitCountClause = (node: ctx.CountClauseContext): string => {
        const varBinding = node.varBinding() ? this.v(node.varBinding()) : "";
        return `count ${varBinding}`;
    };

    // ─── Expressions ──────────────────────────────────────────────────────────

    public override visitExpr = (node: ctx.ExprContext): string => {
        return formatCommaSeparated(node.exprSingle().map((e) => this.v(e)));
    };

    public override visitIfExpr = (node: ctx.IfExprContext): string => {
        const cond = node._test_condition ? this.v(node._test_condition) : "";
        const thenBranch = node._branch ? this.v(node._branch) : "";
        const elseBranch = node._else_branch ? this.v(node._else_branch) : "";
        return formatIfExpression(cond, thenBranch, elseBranch, this.ctx);
    };

    public override visitTryCatchExpr = (node: ctx.TryCatchExprContext): string => {
        const tryExpr = node._try_expression ? this.v(node._try_expression) : "";
        const catches = node.catchClause().map((c) => this.v(c));
        return formatTryCatch(tryExpr, catches, this.ctx);
    };

    public override visitCatchClause = (node: ctx.CatchClauseContext): string => {
        const catchExpr = node._catch_expression ? this.v(node._catch_expression) : "";
        const catchVar = node._catch_var ? ` (${this.v(node._catch_var)})` : "";
        const body = formatBlock(catchExpr, this.ctx);
        return `catch${catchVar} ${body}`;
    };

    // ─── Maps & Arrays (XQuery 3.1) ───────────────────────────────────────────

    public override visitObjectConstructor = (node: ctx.ObjectConstructorContext): string => {
        const outerIndent = this.ctx.currentIndent;
        this.ctx.indent();
        const pairs = node.pairConstructor().map((p) => this.v(p));
        const indentedPairs = pairs
            .map((p) =>
                p.startsWith(this.ctx.currentIndent) ? p : `${this.ctx.currentIndent}${p}`,
            )
            .join(",\n");
        this.ctx.dedent();

        if (pairs.length === 0) {
            return "map {}";
        }

        const singleLine = `map { ${formatCommaSeparated(pairs)} }`;
        if (
            pairs.length <= 2 &&
            !singleLine.includes("\n") &&
            singleLine.length + outerIndent.length <= this.ctx.options.maxLineWidth
        ) {
            return singleLine;
        }

        return `${outerIndent}map {\n${indentedPairs}\n${outerIndent}}`;
    };

    public override visitPairConstructor = (node: ctx.PairConstructorContext): string => {
        const lhs = node._lhs ? this.v(node._lhs) : "";
        const rhs = node._rhs ? this.v(node._rhs) : "";
        return `${lhs}: ${rhs}`;
    };

    public override visitSquareArrayConstructor = (
        node: ctx.SquareArrayConstructorContext,
    ): string => {
        const outerIndent = this.ctx.currentIndent;
        this.ctx.indent();
        const items = node.exprSingle().map((e) => {
            const text = this.v(e);
            if (
                (text.startsWith("for ") || text.startsWith("let ")) &&
                !/\b(where|let|for|order|group)\b/.test(text.slice(4))
            ) {
                const single = text.replace(/\n\s*/g, " ");
                if (
                    single.length + this.ctx.currentIndent.length <=
                    this.ctx.options.maxLineWidth
                ) {
                    return single;
                }
            }
            return text;
        });
        const indentedItems = items
            .map((item) =>
                item.startsWith(this.ctx.currentIndent) ? item : `${this.ctx.currentIndent}${item}`,
            )
            .join(",\n");
        this.ctx.dedent();

        if (items.length === 0) {
            return "[]";
        }

        const singleLine = `[ ${formatCommaSeparated(items)} ]`;
        if (
            !singleLine.includes("\n") &&
            singleLine.length + outerIndent.length <= this.ctx.options.maxLineWidth
        ) {
            return singleLine;
        }

        return `[\n${indentedItems}\n${outerIndent}]`;
    };

    public override visitCurlyArrayConstructor = (
        node: ctx.CurlyArrayConstructorContext,
    ): string => {
        const enclosed = node.enclosedExpression() ? this.v(node.enclosedExpression()) : "{}";
        return `array ${enclosed}`;
    };

    public override visitPostfixExpr = (node: ctx.PostfixExprContext): string => {
        const count = node.getChildCount();
        let result = "";
        for (let i = 0; i < count; i++) {
            const child = node.getChild(i);
            if (child !== null) {
                result += this.v(child);
            }
        }
        return result;
    };

    public override visitPredicate = (node: ctx.PredicateContext): string => {
        const expr = node.expr() ? this.v(node.expr()) : "";
        return `[${expr}]`;
    };

    public override visitContextItemExpr = (_node: ctx.ContextItemExprContext): string => {
        return ".";
    };

    // ─── Primary & Miscellaneous ──────────────────────────────────────────────

    public override visitParenthesizedExpr = (node: ctx.ParenthesizedExprContext): string => {
        const exprNode = node.expr();
        if (!exprNode) {
            return "()";
        }

        const outerIndent = this.ctx.currentIndent;
        const singleText = this.v(exprNode);
        const singleLine = `(${singleText})`;
        if (
            !singleLine.includes("\n") &&
            singleLine.length + outerIndent.length <= this.ctx.options.maxLineWidth
        ) {
            return singleLine;
        }

        this.ctx.indent();
        let items: string[];
        if ("exprSingle" in exprNode && typeof exprNode.exprSingle === "function") {
            items = (exprNode as ctx.ExprContext).exprSingle().map((e) => this.v(e));
        } else {
            items = [this.v(exprNode)];
        }
        const hasNewline = items.some((item) => item.includes("\n"));
        const joiner = hasNewline ? ",\n" : ", ";
        const indentedContent = items
            .map((item) =>
                item.startsWith(this.ctx.currentIndent) ? item : `${this.ctx.currentIndent}${item}`,
            )
            .join(joiner);
        this.ctx.dedent();

        return `(\n${indentedContent}\n${outerIndent})`;
    };

    public override visitFunctionCall = (node: ctx.FunctionCallContext): string => {
        const fnName = node._fn_name ? this.v(node._fn_name) : "";
        const args = node.argumentList() ? this.v(node.argumentList()) : "()";
        return `${fnName}${args}`;
    };

    public override visitArgumentList = (node: ctx.ArgumentListContext): string => {
        const args = node.argument().map((a) => this.v(a));
        if (args.length === 0) {
            return "()";
        }

        const singleLine = `(${formatCommaSeparated(args)})`;
        if (
            !singleLine.includes("\n") &&
            singleLine.length + this.ctx.currentIndent.length <= this.ctx.options.maxLineWidth
        ) {
            return singleLine;
        }

        this.ctx.indent();
        const indentedArgs = args
            .map((arg) => {
                const lines = arg.split("\n");
                return lines
                    .map((l) => (l.trim() === "" ? "" : `${this.ctx.currentIndent}${l}`))
                    .join("\n");
            })
            .join(",\n");
        this.ctx.dedent();

        return `(\n${indentedArgs}\n${this.ctx.currentIndent})`;
    };

    public override visitArgument = (node: ctx.ArgumentContext): string => {
        if (node.QUESTION() !== null) {
            return "?";
        }
        return node.exprSingle() ? this.v(node.exprSingle()) : "";
    };

    public override visitVarRef = (node: ctx.VarRefContext): string => {
        const name = node._var_name ? this.v(node._var_name) : "";
        return `$${name}`;
    };

    public override visitVarBinding = (node: ctx.VarBindingContext): string => {
        const name = node._var_name ? this.v(node._var_name) : "";
        return `$${name}`;
    };

    public override visitEnclosedExpression = (node: ctx.EnclosedExpressionContext): string => {
        const expr = node.expr() ? this.v(node.expr()) : "";
        return formatBlock(expr, this.ctx);
    };

    public override visitSequenceType = (node: ctx.SequenceTypeContext): string => {
        if (node.KW_EMPTY_SEQUENCE()) {
            return "empty-sequence()";
        }
        const item = node._item ? this.v(node._item) : "";
        const occurrence =
            node._question && node._question.length > 0
                ? "?"
                : node._star && node._star.length > 0
                  ? "*"
                  : node._plus && node._plus.length > 0
                    ? "+"
                    : "";
        return `${item}${occurrence}`;
    };
}

export function createXQueryFormatterVisitor(ctx: FormatterContext): XQueryFormatterVisitor {
    return new XQueryFormatterVisitor(ctx);
}

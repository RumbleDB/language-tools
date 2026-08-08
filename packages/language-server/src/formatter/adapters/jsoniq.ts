import { ParseTree, TerminalNode, Token } from "antlr4ng";
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
    formatFlworExpressionDoc,
    formatIfExpressionDoc,
    formatTryCatchDoc,
    getTokenLiteral,
    groupStartingWith,
    shouldSeparateDeclarations,
} from "server/formatter/helpers.js";
import { printDocToString } from "server/formatter/printer.js";
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
    private token(
        terminal: TerminalNode | TerminalNode[] | Token | null | undefined,
        expectedToken: number | string,
    ): TokenDoc {
        if (Array.isArray(terminal)) {
            terminal = terminal[0] ?? null;
        }
        if (terminal) {
            return this.ctx.formatToken(terminal);
        }
        const expected =
            typeof expectedToken === "number"
                ? getTokenLiteral(expectedToken, JsoniqLexer.literalNames)
                : expectedToken;
        return this.ctx.formatSyntheticToken(expected);
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

    private isEmpty = (doc: Doc): boolean => doc.kind === "text" && doc.text === "";

    private joinWithCommas = (
        items: readonly Doc[],
        commas: readonly TerminalNode[],
        breakDoc: Doc = line,
    ): Doc => {
        const docs: Doc[] = [];
        for (let i = 0; i < items.length; i++) {
            if (i > 0) {
                docs.push(this.kw(commas[i - 1], JsoniqParser.COMMA), breakDoc);
            }
            docs.push(items[i]!);
        }
        return concat(docs);
    };

    private formatStatementBlock = (leftBrace: Doc, statements: Doc, rightBrace: Doc): Doc => {
        if (this.isEmpty(statements)) {
            return concat([leftBrace, rightBrace]);
        }
        return concat([leftBrace, indent(concat([hardline, statements])), hardline, rightBrace]);
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
        const startIdx = node.start?.tokenIndex;
        const stopIdx = node.stop?.tokenIndex;
        const leading = startIdx != null ? this.ctx.flushLeadingDoc(startIdx) : NIL;
        const trailing = stopIdx != null ? this.ctx.flushTrailingDoc(stopIdx) : NIL;
        return concat([leading, text(node.getText()), trailing]);
    };

    public override visitUriLiteral = (node: ctx.UriLiteralContext): Doc => {
        const startIdx = node.start?.tokenIndex;
        const stopIdx = node.stop?.tokenIndex;
        const leading = startIdx != null ? this.ctx.flushLeadingDoc(startIdx) : NIL;
        const trailing = stopIdx != null ? this.ctx.flushTrailingDoc(stopIdx) : NIL;
        return concat([leading, text(node.getText()), trailing]);
    };

    // ─── Module & Prolog ──────────────────────────────────────────────────────

    public override visitModuleAndThisIsIt = (node: ctx.ModuleAndThisIsItContext): Doc => {
        const body = this.visitChildren(node) ?? NIL;
        const dangling = this.ctx.formatDanglingDoc();
        return concat([body, dangling]);
    };

    public override visitModule = (node: ctx.ModuleContext): Doc => {
        const parts: Doc[] = [];
        if (node.KW_JSONIQ() !== null) {
            const kwJsoniq = this.kw(node.KW_JSONIQ(), JsoniqParser.KW_JSONIQ);
            const kwVer = this.kw(node.KW_VERSION(), JsoniqParser.KW_VERSION);
            const versionStr = node._vers ? this.v(node._vers) : NIL;
            const encStr = node._encoding
                ? concat([
                      space,
                      this.kw(node.KW_ENCODING(), JsoniqParser.KW_ENCODING),
                      space,
                      this.v(node._encoding),
                  ])
                : NIL;
            const semi = this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON);
            parts.push(concat([kwJsoniq, space, kwVer, space, versionStr, encStr, semi]));
        }
        if (node.libraryModule()) {
            parts.push(this.v(node.libraryModule()));
        } else if (node.mainModule()) {
            parts.push(this.v(node.mainModule()));
        }
        return join(concat([hardline, hardline]), parts);
    };

    public override visitLibraryModule = (node: ctx.LibraryModuleContext): Doc => {
        const kwModule = this.kw(node.KW_MODULE(), JsoniqParser.KW_MODULE);
        const kwNamespace = this.kw(node.KW_NAMESPACE(), JsoniqParser.KW_NAMESPACE);
        const ncName = node.ncName() ? this.v(node.ncName()) : NIL;
        const eq = this.kw(node.EQUAL(), JsoniqParser.EQUAL);
        const uri = node._uri ? this.v(node._uri) : NIL;
        const semi = this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON);
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
        const decl = this.kw(node.KW_DECLARE(), JsoniqParser.KW_DECLARE);
        const annotations = node.annotations() ? this.v(node.annotations()) : NIL;
        const fnKw = this.kw(node.KW_FUNCTION(), JsoniqParser.KW_FUNCTION);
        const name = node.functionName() ? this.v(node.functionName()) : NIL;
        const lparen = this.kw(node.LPAREN(), JsoniqParser.LPAREN);
        const rparen = this.kw(node.RPAREN(), JsoniqParser.RPAREN);
        const params = node.paramList()
            ? concat([lparen, this.v(node.paramList()), rparen])
            : concat([lparen, rparen]);
        const returnType = node._return_type ? this.v(node._return_type) : null;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), JsoniqParser.KW_AS) : null;
        const isExternal = node.KW_EXTERNAL() !== null || node._is_external !== undefined;

        const signature = spacedDocs(decl, annotations, fnKw, concat([name, params]));
        const withReturn =
            returnType !== null && kwAs !== null
                ? spacedDocs(signature, kwAs, returnType)
                : signature;

        const semi = this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON);

        if (isExternal) {
            const kwExternal = this.kw(node.KW_EXTERNAL(), JsoniqParser.KW_EXTERNAL);
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
                this.kw(node.LBRACE(), JsoniqParser.LBRACE),
                bodyDoc,
                this.kw(node.RBRACE(), JsoniqParser.RBRACE),
            ),
            semi,
        ]);
    };

    public override visitVarDecl = (node: ctx.VarDeclContext): Doc => {
        const decl = this.kw(node.KW_DECLARE(), JsoniqParser.KW_DECLARE);
        const annotations = node.annotations() ? this.v(node.annotations()) : NIL;
        const varKw = this.kw(node.KW_VARIABLE(), JsoniqParser.KW_VARIABLE);
        const name = node.varBinding() ? this.v(node.varBinding()) : NIL;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), JsoniqParser.KW_AS) : null;
        const typeSeq = node.sequenceType() ? this.v(node.sequenceType()) : null;
        const expr = node.exprSingle() ? this.v(node.exprSingle()) : null;
        const isExternal = node.KW_EXTERNAL() !== null || node._external !== undefined;

        const prefix = spacedDocs(decl, annotations, varKw, name);
        const typed =
            typeSeq !== null && kwAs !== null ? spacedDocs(prefix, kwAs, typeSeq) : prefix;
        const semi = this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON);

        if (isExternal) {
            const kwExternal = this.kw(node.KW_EXTERNAL(), JsoniqParser.KW_EXTERNAL);
            return concat([typed, space, kwExternal, semi]);
        }

        const assign = node.COLON_EQ() ? this.kw(node.COLON_EQ(), JsoniqParser.COLON_EQ) : null;
        return concat([
            typed,
            expr !== null && assign !== null ? concat([space, assign, space, expr]) : NIL,
            semi,
        ]);
    };

    public override visitParamList = (node: ctx.ParamListContext): Doc => {
        return this.joinWithCommas(
            node.param().map((p) => this.v(p)),
            node.getTokens(JsoniqParser.COMMA),
        );
    };

    public override visitParam = (node: ctx.ParamContext): Doc => {
        const name = node.varBinding() ? this.v(node.varBinding()) : NIL;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), JsoniqParser.KW_AS) : null;
        const typeSeq = node.sequenceType()
            ? concat([space, kwAs!, space, this.v(node.sequenceType())])
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
        if (node.KW_UPDATING() !== null || node._updating !== undefined) {
            return this.kw(node.KW_UPDATING(), JsoniqParser.KW_UPDATING);
        }
        const pct = this.kw(node.MOD(), JsoniqParser.MOD);
        const name = node._name ? this.v(node._name) : NIL;
        const lits = node.literal().map((l) => this.v(l));
        if (lits.length > 0) {
            const lp = this.kw(node.LPAREN(), JsoniqParser.LPAREN);
            const rp = this.kw(node.RPAREN(), JsoniqParser.RPAREN);
            return concat([
                pct,
                name,
                lp,
                this.joinWithCommas(lits, node.getTokens(JsoniqParser.COMMA)),
                rp,
            ]);
        }
        return concat([pct, name]);
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
        return this.v(node.statementsAndOptionalExpr());
    };

    public override visitStatements = (node: ctx.StatementsContext): Doc => {
        return join(
            hardline,
            node.statement().map((statement) => this.v(statement)),
        );
    };

    public override visitStatementsAndExpr = (node: ctx.StatementsAndExprContext): Doc => {
        const statements = this.v(node.statements());
        const expr = this.v(node.expr());
        return this.isEmpty(statements) ? expr : concat([statements, hardline, expr]);
    };

    public override visitStatementsAndOptionalExpr = (
        node: ctx.StatementsAndOptionalExprContext,
    ): Doc => {
        const statements = this.v(node.statements());
        const expr = node.expr() ? this.v(node.expr()) : NIL;
        if (this.isEmpty(statements)) {
            return expr;
        }
        return this.isEmpty(expr) ? statements : concat([statements, hardline, expr]);
    };

    public override visitStatement = (node: ctx.StatementContext): Doc => {
        return this.visitChildren(node) ?? NIL;
    };

    public override visitApplyStatement = (node: ctx.ApplyStatementContext): Doc => {
        return concat([
            this.v(node.exprSimple()),
            this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON),
        ]);
    };

    public override visitAssignStatement = (node: ctx.AssignStatementContext): Doc => {
        return concat([
            this.v(node.varRef()),
            space,
            this.kw(node.COLON_EQ(), JsoniqParser.COLON_EQ),
            space,
            this.v(node.exprSingle()),
            this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON),
        ]);
    };

    public override visitBlockStatement = (node: ctx.BlockStatementContext): Doc => {
        return this.formatStatementBlock(
            this.kw(node.LBRACE(), JsoniqParser.LBRACE),
            this.v(node.statements()),
            this.kw(node.RBRACE(), JsoniqParser.RBRACE),
        );
    };

    public override visitBreakStatement = (node: ctx.BreakStatementContext): Doc => {
        return concat([
            this.kw(node.KW_BREAK(), JsoniqParser.KW_BREAK),
            space,
            this.kw(node.KW_LOOP(), JsoniqParser.KW_LOOP),
            this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON),
        ]);
    };

    public override visitContinueStatement = (node: ctx.ContinueStatementContext): Doc => {
        return concat([
            this.kw(node.KW_CONTINUE(), JsoniqParser.KW_CONTINUE),
            space,
            this.kw(node.KW_LOOP(), JsoniqParser.KW_LOOP),
            this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON),
        ]);
    };

    public override visitExitStatement = (node: ctx.ExitStatementContext): Doc => {
        return concat([
            this.kw(node.KW_EXIT(), JsoniqParser.KW_EXIT),
            space,
            this.kw(node.KW_RETURNING(), JsoniqParser.KW_RETURNING),
            space,
            this.v(node.exprSingle()),
            this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON),
        ]);
    };

    public override visitFlworStatement = (node: ctx.FlworStatementContext): Doc => {
        const clauses: Doc[] = [];
        for (let i = 0; i < node.getChildCount(); i++) {
            const child = node.getChild(i);
            if (child !== null && child !== node.KW_RETURN() && child !== node.statement()) {
                const doc = this.v(child);
                if (!this.isEmpty(doc)) {
                    clauses.push(doc);
                }
            }
        }
        return concat([
            join(hardline, clauses),
            hardline,
            this.kw(node.KW_RETURN(), JsoniqParser.KW_RETURN),
            space,
            this.v(node.statement()),
        ]);
    };

    public override visitIfStatement = (node: ctx.IfStatementContext): Doc => {
        const thenStatement = node.statement(0);
        const elseStatement = node.statement(1);
        const thenBranch = this.v(thenStatement);
        const elseBranch = this.v(elseStatement);
        const thenContent = thenStatement?.blockStatement()
            ? concat([space, thenBranch])
            : indent(concat([line, thenBranch]));
        const elseContent = elseStatement?.blockStatement()
            ? concat([space, elseBranch])
            : indent(concat([line, elseBranch]));
        return group(
            concat([
                this.kw(node.KW_IF(), JsoniqParser.KW_IF),
                space,
                this.kw(node.LPAREN(), JsoniqParser.LPAREN),
                this.v(node.expr()),
                this.kw(node.RPAREN(), JsoniqParser.RPAREN),
                space,
                this.kw(node.KW_THEN(), JsoniqParser.KW_THEN),
                thenContent,
                thenStatement?.blockStatement() ? space : line,
                this.kw(node.KW_ELSE(), JsoniqParser.KW_ELSE),
                elseContent,
            ]),
        );
    };

    public override visitSwitchStatement = (node: ctx.SwitchStatementContext): Doc => {
        const cases = node.switchCaseStatement().map((caseStatement) => this.v(caseStatement));
        const defaultCase = concat([
            this.kw(node.KW_DEFAULT(), JsoniqParser.KW_DEFAULT),
            space,
            this.kw(node.KW_RETURN(), JsoniqParser.KW_RETURN),
            space,
            this.v(node.statement()),
        ]);
        return concat([
            this.kw(node.KW_SWITCH(), JsoniqParser.KW_SWITCH),
            space,
            this.kw(node.LPAREN(), JsoniqParser.LPAREN),
            this.v(node.expr()),
            this.kw(node.RPAREN(), JsoniqParser.RPAREN),
            indent(concat([hardline, join(hardline, cases), hardline, defaultCase])),
        ]);
    };

    public override visitSwitchCaseStatement = (node: ctx.SwitchCaseStatementContext): Doc => {
        const conditions = node.exprSingle().map((condition) => this.v(condition));
        const caseDocs = conditions.flatMap((condition) => [
            this.kw(node.KW_CASE(), JsoniqParser.KW_CASE),
            space,
            condition,
            space,
        ]);
        return concat([
            ...caseDocs,
            this.kw(node.KW_RETURN(), JsoniqParser.KW_RETURN),
            space,
            this.v(node.statement()),
        ]);
    };

    public override visitTryCatchStatement = (node: ctx.TryCatchStatementContext): Doc => {
        return concat([
            this.kw(node.KW_TRY(), JsoniqParser.KW_TRY),
            space,
            this.v(node.blockStatement()),
            hardline,
            join(
                hardline,
                node.catchCaseStatement().map((catchCase) => this.v(catchCase)),
            ),
        ]);
    };

    public override visitCatchCaseStatement = (node: ctx.CatchCaseStatementContext): Doc => {
        const targets =
            node.getChildCount() > 0
                ? node
                      .wildcard()
                      .map((wildcard) => this.v(wildcard))
                      .concat(node.eqName().map((name) => this.v(name)))
                : [];
        return concat([
            this.kw(node.KW_CATCH(), JsoniqParser.KW_CATCH),
            space,
            join(concat([space, this.kw(node.VBAR(), JsoniqParser.VBAR), space]), targets),
            space,
            this.v(node.blockStatement()),
        ]);
    };

    public override visitTypeSwitchStatement = (node: ctx.TypeSwitchStatementContext): Doc => {
        const cases = node.caseStatement().map((caseStatement) => this.v(caseStatement));
        const binding = node.varBinding() ? concat([space, this.v(node.varBinding())]) : NIL;
        const defaultCase = concat([
            this.kw(node.KW_DEFAULT(), JsoniqParser.KW_DEFAULT),
            binding,
            space,
            this.kw(node.KW_RETURN(), JsoniqParser.KW_RETURN),
            space,
            this.v(node.statement()),
        ]);
        return concat([
            this.kw(node.KW_TYPESWITCH(), JsoniqParser.KW_TYPESWITCH),
            space,
            this.kw(node.LPAREN(), JsoniqParser.LPAREN),
            this.v(node.expr()),
            this.kw(node.RPAREN(), JsoniqParser.RPAREN),
            indent(concat([hardline, join(hardline, cases), hardline, defaultCase])),
        ]);
    };

    public override visitCaseStatement = (node: ctx.CaseStatementContext): Doc => {
        const binding = node.varBinding()
            ? concat([
                  this.v(node.varBinding()),
                  space,
                  this.kw(node.KW_AS(), JsoniqParser.KW_AS),
                  space,
              ])
            : NIL;
        return concat([
            this.kw(node.KW_CASE(), JsoniqParser.KW_CASE),
            space,
            binding,
            join(
                concat([space, this.kw(node.VBAR(), JsoniqParser.VBAR), space]),
                node.sequenceType().map((type) => this.v(type)),
            ),
            space,
            this.kw(node.KW_RETURN(), JsoniqParser.KW_RETURN),
            space,
            this.v(node.statement()),
        ]);
    };

    public override visitVarDeclStatement = (node: ctx.VarDeclStatementContext): Doc => {
        const annotations = node.annotations() ? this.v(node.annotations()) : NIL;
        return concat([
            annotations,
            annotations === NIL ? NIL : space,
            this.kw(node.KW_VARIABLE(), JsoniqParser.KW_VARIABLE),
            space,
            this.joinWithCommas(
                node.varDeclForStatement().map((decl) => this.v(decl)),
                node.getTokens(JsoniqParser.COMMA),
            ),
            this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON),
        ]);
    };

    public override visitVarDeclForStatement = (node: ctx.VarDeclForStatementContext): Doc => {
        const binding = this.v(node.varBinding());
        const sequenceType = node.sequenceType()
            ? concat([
                  space,
                  this.kw(node.KW_AS(), JsoniqParser.KW_AS),
                  space,
                  this.v(node.sequenceType()),
              ])
            : NIL;
        const value = node.exprSingle()
            ? concat([
                  space,
                  this.kw(node.COLON_EQ(), JsoniqParser.COLON_EQ),
                  space,
                  this.v(node.exprSingle()),
              ])
            : NIL;
        return concat([binding, sequenceType, value]);
    };

    public override visitWhileStatement = (node: ctx.WhileStatementContext): Doc => {
        const statement = node.statement();
        const body = this.v(statement);
        const bodyContent = statement.blockStatement()
            ? concat([space, body])
            : indent(concat([line, body]));
        return group(
            concat([
                this.kw(node.KW_WHILE(), JsoniqParser.KW_WHILE),
                space,
                this.kw(node.LPAREN(), JsoniqParser.LPAREN),
                this.v(node.expr()),
                this.kw(node.RPAREN(), JsoniqParser.RPAREN),
                bodyContent,
            ]),
        );
    };

    public override visitBlockExpr = (node: ctx.BlockExprContext): Doc => {
        return this.formatStatementBlock(
            this.kw(node.LBRACE(), JsoniqParser.LBRACE),
            this.v(node.statementsAndExpr()),
            this.kw(node.RBRACE(), JsoniqParser.RBRACE),
        );
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
        const returnKw = this.kw(node.KW_RETURN(), JsoniqParser.KW_RETURN);
        const returnExpr = node._return_expr ? this.v(node._return_expr) : NIL;
        return group(formatFlworExpressionDoc(clauses, returnKw, returnExpr));
    };

    public override visitForClause = (node: ctx.ForClauseContext): Doc => {
        const kw = this.kw(node.KW_FOR(), JsoniqParser.KW_FOR);
        const vars = node._vars.map((v) => this.v(v));
        return group(
            concat([kw, space, this.joinWithCommas(vars, node.getTokens(JsoniqParser.COMMA))]),
        );
    };

    public override visitForVar = (node: ctx.ForVarContext): Doc => {
        const varRef = node._var_ref ? this.v(node._var_ref) : NIL;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), JsoniqParser.KW_AS) : null;
        const seq = node._seq && kwAs ? concat([space, kwAs, space, this.v(node._seq)]) : NIL;
        const kwAllowing = node.allowingEmpty() ? this.v(node.allowingEmpty()) : NIL;
        const allowingEmpty = kwAllowing !== NIL ? concat([space, kwAllowing]) : NIL;
        const kwAt = node.KW_AT() ? this.kw(node.KW_AT(), JsoniqParser.KW_AT) : null;
        const at = node._at && kwAt ? concat([space, kwAt, space, this.v(node._at)]) : NIL;
        const kwIn = this.kw(node.KW_IN(), JsoniqParser.KW_IN);
        const inExpr = node._ex ? this.v(node._ex) : NIL;
        return concat([varRef, seq, allowingEmpty, at, space, kwIn, space, inExpr]);
    };

    public override visitLetClause = (node: ctx.LetClauseContext): Doc => {
        const kw = this.kw(node.KW_LET(), JsoniqParser.KW_LET);
        const vars = node._vars.map((v) => this.v(v));
        return group(
            concat([kw, space, this.joinWithCommas(vars, node.getTokens(JsoniqParser.COMMA))]),
        );
    };

    public override visitLetVar = (node: ctx.LetVarContext): Doc => {
        const varRef = node._var_ref ? this.v(node._var_ref) : NIL;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), JsoniqParser.KW_AS) : null;
        const seq = node._seq && kwAs ? concat([space, kwAs, space, this.v(node._seq)]) : NIL;
        const assign = this.kw(node.COLON_EQ(), JsoniqParser.COLON_EQ);
        const expr = node._ex ? this.v(node._ex) : NIL;
        return concat([varRef, seq, space, assign, space, expr]);
    };

    public override visitWhereClause = (node: ctx.WhereClauseContext): Doc => {
        const kw = this.kw(node.KW_WHERE(), JsoniqParser.KW_WHERE);
        const expr = node.exprSingle() ? this.v(node.exprSingle()) : NIL;
        return concat([kw, space, expr]);
    };

    public override visitGroupByClause = (node: ctx.GroupByClauseContext): Doc => {
        const kwGroup = this.kw(node.KW_GROUP(), JsoniqParser.KW_GROUP);
        const kwBy = this.kw(node.KW_BY(), JsoniqParser.KW_BY);
        const vars = node._vars.map((v) => this.v(v));
        return group(
            concat([
                kwGroup,
                space,
                kwBy,
                space,
                this.joinWithCommas(vars, node.getTokens(JsoniqParser.COMMA)),
            ]),
        );
    };

    public override visitGroupByVar = (node: ctx.GroupByVarContext): Doc => {
        const varRef = node._var_ref ? this.v(node._var_ref) : NIL;
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), JsoniqParser.KW_AS) : null;
        const seq = node._seq && kwAs ? concat([space, kwAs, space, this.v(node._seq)]) : NIL;
        const assign = node.COLON_EQ() ? this.kw(node.COLON_EQ(), JsoniqParser.COLON_EQ) : null;
        const expr = node._ex && assign ? concat([space, assign, space, this.v(node._ex)]) : NIL;
        return concat([varRef, seq, expr]);
    };

    public override visitOrderByClause = (node: ctx.OrderByClauseContext): Doc => {
        const specs = node._specs.map((s) => this.v(s));
        const kwStable = node.KW_STABLE()
            ? concat([this.kw(node.KW_STABLE(), JsoniqParser.KW_STABLE), space])
            : NIL;
        const kwOrder = this.kw(node.KW_ORDER(), JsoniqParser.KW_ORDER);
        const kwBy = this.kw(node.KW_BY(), JsoniqParser.KW_BY);
        return group(
            concat([
                kwStable,
                kwOrder,
                space,
                kwBy,
                space,
                this.joinWithCommas(specs, node.getTokens(JsoniqParser.COMMA)),
            ]),
        );
    };

    public override visitCountClause = (node: ctx.CountClauseContext): Doc => {
        const kw = this.kw(node.KW_COUNT(), JsoniqParser.KW_COUNT);
        const varBinding = node.varBinding() ? this.v(node.varBinding()) : NIL;
        return concat([kw, space, varBinding]);
    };

    // ─── Expressions ──────────────────────────────────────────────────────────

    public override visitExpr = (node: ctx.ExprContext): Doc => {
        return group(
            this.joinWithCommas(
                node.exprSingle().map((e) => this.v(e)),
                node.getTokens(JsoniqParser.COMMA),
            ),
        );
    };

    public override visitIfExpr = (node: ctx.IfExprContext): Doc => {
        const kwIf = this.kw(node.KW_IF(), JsoniqParser.KW_IF);
        const lparen = this.kw(node.LPAREN(), JsoniqParser.LPAREN);
        const rparen = this.kw(node.RPAREN(), JsoniqParser.RPAREN);
        const kwThen = this.kw(node.KW_THEN(), JsoniqParser.KW_THEN);
        const kwElse = this.kw(node.KW_ELSE(), JsoniqParser.KW_ELSE);
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
        const kwTry = this.kw(node.KW_TRY(), JsoniqParser.KW_TRY);
        const tryExpr = node._try_expression ? this.v(node._try_expression) : NIL;
        const catches = node.catchClause().map((c) => this.v(c));
        return formatTryCatchDoc(
            kwTry,
            this.kw(node.LBRACE(), JsoniqParser.LBRACE),
            tryExpr,
            this.kw(node.RBRACE(), JsoniqParser.RBRACE),
            catches,
        );
    };

    public override visitCatchClause = (node: ctx.CatchClauseContext): Doc => {
        const kwCatch = this.kw(node.KW_CATCH(), JsoniqParser.KW_CATCH);
        const catchExpr = node._catch_expression ? this.v(node._catch_expression) : NIL;
        let catchTarget: Doc = NIL;
        if (node._catch_var) {
            const lp = this.kw(node.LPAREN(), JsoniqParser.LPAREN);
            const rp = this.kw(node.RPAREN(), JsoniqParser.RPAREN);
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
                const vbar = this.kw(node.VBAR(), JsoniqParser.VBAR);
                catchTarget = concat([space, join(concat([space, vbar, space]), targets)]);
            }
        }
        const body = formatBlockDoc(
            this.kw(node.LBRACE(), JsoniqParser.LBRACE),
            catchExpr,
            this.kw(node.RBRACE(), JsoniqParser.RBRACE),
        );
        return concat([kwCatch, catchTarget, space, body]);
    };

    public override visitSwitchExpr = (node: ctx.SwitchExprContext): Doc => {
        const kwSwitch = this.kw(node.KW_SWITCH(), JsoniqParser.KW_SWITCH);
        const lp = this.kw(node.LPAREN(), JsoniqParser.LPAREN);
        const rp = this.kw(node.RPAREN(), JsoniqParser.RPAREN);
        const cond = node._cond ? this.v(node._cond) : NIL;
        const cases = node.switchCaseClause().map((c) => this.v(c));
        const kwDefault = this.kw(node.KW_DEFAULT(), JsoniqParser.KW_DEFAULT);
        const kwReturn = this.kw(node.KW_RETURN(), JsoniqParser.KW_RETURN);
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
            const kw = this.kw(cases[i] ?? null, JsoniqParser.KW_CASE);
            caseParts.push(concat([kw, space, conds[i]!]));
        }
        const kwReturn = this.kw(node.KW_RETURN(), JsoniqParser.KW_RETURN);
        const caseHeader = join(space, caseParts);
        return group(
            concat([caseHeader, space, kwReturn, space, indent(concat([softline, retExpr]))]),
        );
    };

    public override visitTypeswitchExpr = (node: ctx.TypeswitchExprContext): Doc => {
        const kwTypeswitch = this.kw(node.KW_TYPESWITCH(), JsoniqParser.KW_TYPESWITCH);
        const lp = this.kw(node.LPAREN(), JsoniqParser.LPAREN);
        const rp = this.kw(node.RPAREN(), JsoniqParser.RPAREN);
        const cond = node._cond ? this.v(node._cond) : NIL;
        const cases = node.caseClause().map((c) => this.v(c));
        const kwDefault = this.kw(node.KW_DEFAULT(), JsoniqParser.KW_DEFAULT);
        const defVar = node._var_ref ? concat([space, this.v(node._var_ref)]) : NIL;
        const kwReturn = this.kw(node.KW_RETURN(), JsoniqParser.KW_RETURN);
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
        const kwCase = this.kw(node.KW_CASE(), JsoniqParser.KW_CASE);
        const kwAs = node.KW_AS() ? this.kw(node.KW_AS(), JsoniqParser.KW_AS) : null;
        const varRef =
            node._var_ref && kwAs ? concat([this.v(node._var_ref), space, kwAs, space]) : NIL;
        const unions = node._union ? node._union.map((u) => this.v(u)) : [];
        const vbar = this.kw(node.VBAR(), JsoniqParser.VBAR);
        const unionTypes = join(concat([space, vbar, space]), unions);
        const kwReturn = this.kw(node.KW_RETURN(), JsoniqParser.KW_RETURN);
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
        if (pairs.length === 0) {
            return concat([composeTokenDoc(lb), rb]);
        }

        if (pairs.length > 2) {
            return concat([
                composeTokenDoc(lb),
                indent(
                    concat([
                        hardline,
                        this.joinWithCommas(pairs, node.getTokens(JsoniqParser.COMMA), hardline),
                    ]),
                ),
                hardline,
                rb,
            ]);
        }

        return groupStartingWith(
            lb,
            concat([
                indent(
                    concat([line, this.joinWithCommas(pairs, node.getTokens(JsoniqParser.COMMA))]),
                ),
                line,
                rb,
            ]),
        );
    };

    public override visitPairConstructor = (node: ctx.PairConstructorContext): Doc => {
        const lhs = node._lhs ? this.v(node._lhs) : NIL;
        const colon = this.kw(node.COLON(), JsoniqParser.COLON);
        const rhs = node._rhs ? this.v(node._rhs) : NIL;
        return concat([lhs, colon, space, rhs]);
    };

    public override visitSquareArrayConstructor = (
        node: ctx.SquareArrayConstructorContext,
    ): Doc => {
        const lbracket = this.token(node.LBRACKET(), JsoniqParser.LBRACKET);
        const rbracket = this.kw(node.RBRACKET(), JsoniqParser.RBRACKET);
        const exprSingles = node.exprSingle();
        if (exprSingles.length === 0) {
            return concat([composeTokenDoc(lbracket), rbracket]);
        }

        const items = exprSingles.map((e) => this.v(e));
        return groupStartingWith(
            lbracket,
            concat([
                indent(
                    concat([line, this.joinWithCommas(items, node.getTokens(JsoniqParser.COMMA))]),
                ),
                line,
                rbracket,
            ]),
        );
    };

    public override visitCurlyArrayConstructor = (node: ctx.CurlyArrayConstructorContext): Doc => {
        const kwArray = this.kw(node.KW_ARRAY(), JsoniqParser.KW_ARRAY);
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
        const lb = this.kw(node.LBRACKET(), JsoniqParser.LBRACKET);
        const rb = this.kw(node.RBRACKET(), JsoniqParser.RBRACKET);
        const expr = node.expr() ? this.v(node.expr()) : NIL;
        return concat([lb, expr, rb]);
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
        const exprNode = node.expr();
        const lp = this.kw(node.LPAREN(), JsoniqParser.LPAREN);
        const rp = this.kw(node.RPAREN(), JsoniqParser.RPAREN);

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
                            this.joinWithCommas(items, node.getTokens(JsoniqParser.COMMA)),
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
        const lp = this.kw(node.LPAREN(), JsoniqParser.LPAREN);
        const rp = this.kw(node.RPAREN(), JsoniqParser.RPAREN);
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
                            this.joinWithCommas(args, node.getTokens(JsoniqParser.COMMA)),
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
            return this.kw(node.QUESTION(), JsoniqParser.QUESTION);
        }
        return node.exprSingle() ? this.v(node.exprSingle()) : NIL;
    };

    public override visitVarRef = (node: ctx.VarRefContext): Doc => {
        const dollar = this.kw(node.DOLLAR(), JsoniqParser.DOLLAR);
        const name = node._var_name ? this.v(node._var_name) : NIL;
        return concat([dollar, name]);
    };

    public override visitVarBinding = (node: ctx.VarBindingContext): Doc => {
        const dollar = this.kw(node.DOLLAR(), JsoniqParser.DOLLAR);
        const name = node._var_name ? this.v(node._var_name) : NIL;
        return concat([dollar, name]);
    };

    public override visitEnclosedExpression = (node: ctx.EnclosedExpressionContext): Doc => {
        const expr = node.expr() ? this.v(node.expr()) : NIL;
        return formatBlockDoc(
            this.kw(node.LBRACE(), JsoniqParser.LBRACE),
            expr,
            this.kw(node.RBRACE(), JsoniqParser.RBRACE),
        );
    };

    public override visitSequenceType = (node: ctx.SequenceTypeContext): Doc => {
        if (node.KW_EMPTY_SEQUENCE()) {
            const kw = this.kw(node.KW_EMPTY_SEQUENCE(), JsoniqParser.KW_EMPTY_SEQUENCE);
            const lp = this.kw(node.LPAREN(), JsoniqParser.LPAREN);
            const rp = this.kw(node.RPAREN(), JsoniqParser.RPAREN);
            return concat([kw, lp, rp]);
        }
        const item = node._item ? this.v(node._item) : NIL;
        let occurrenceDoc: Doc = NIL;
        if (node._question && node._question.length > 0) {
            occurrenceDoc = this.kw(node.QUESTION(), JsoniqParser.QUESTION);
        } else if (node._star && node._star.length > 0) {
            occurrenceDoc = this.kw(node.STAR(), JsoniqParser.STAR);
        } else if (node._plus && node._plus.length > 0) {
            occurrenceDoc = this.kw(node.PLUS(), JsoniqParser.PLUS);
        }
        return concat([item, occurrenceDoc]);
    };
}

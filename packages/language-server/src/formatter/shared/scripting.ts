import type { ParseTree, TerminalNode, Token } from "antlr4ng";
import type * as ctx from "server/parser/context.js";

import { concat, type Doc, group, hardline, indent, join, line, NIL, space } from "../doc.js";
import { formatTokenSeparatedDocs } from "./tokens.js";

type SourceTerminal = TerminalNode | TerminalNode[] | Token | null | undefined;
type FormatTerminal = (terminal: SourceTerminal, expectedToken: number | string) => Doc;
type Visit = (node: ParseTree | null | undefined) => Doc;

function isEmpty(doc: Doc): boolean {
    return doc.kind === "text" && doc.text === "";
}

function formatStatementBlock(leftBrace: Doc, statements: Doc, rightBrace: Doc): Doc {
    return isEmpty(statements)
        ? concat([leftBrace, rightBrace])
        : concat([leftBrace, indent(concat([hardline, statements])), hardline, rightBrace]);
}

export function formatProgram(node: ctx.ProgramContext, visit: Visit): Doc {
    return visit(node.statementsAndOptionalExpr());
}

export function formatStatements(node: ctx.StatementsContext, visit: Visit): Doc {
    return join(hardline, node.statement().map(visit));
}

export function formatStatementsAndExpression(
    node: ctx.StatementsAndExprContext,
    visit: Visit,
): Doc {
    const statements = visit(node.statements());
    const expression = visit(node.expr());
    return isEmpty(statements) ? expression : concat([statements, hardline, expression]);
}

export function formatStatementsAndOptionalExpression(
    node: ctx.StatementsAndOptionalExprContext,
    visit: Visit,
): Doc {
    const statements = visit(node.statements());
    const expression = visit(node.expr());
    if (isEmpty(statements)) {
        return expression;
    }
    return isEmpty(expression) ? statements : concat([statements, hardline, expression]);
}

export function formatApplyStatement(
    node: ctx.ApplyStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([visit(node.exprSimple()), formatTerminal(node.SEMICOLON(), ";")]);
}

export function formatAssignStatement(
    node: ctx.AssignStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([
        visit(node.varRef()),
        space,
        formatTerminal(node.COLON_EQ(), ":="),
        space,
        visit(node.exprSingle()),
        formatTerminal(node.SEMICOLON(), ";"),
    ]);
}

export function formatBlockStatement(
    node: ctx.BlockStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return formatStatementBlock(
        formatTerminal(node.LBRACE(), "{"),
        visit(node.statements()),
        formatTerminal(node.RBRACE(), "}"),
    );
}

export function formatBreakStatement(
    node: ctx.BreakStatementContext,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([
        formatTerminal(node.KW_BREAK(), "break"),
        space,
        formatTerminal(node.KW_LOOP(), "loop"),
        formatTerminal(node.SEMICOLON(), ";"),
    ]);
}

export function formatContinueStatement(
    node: ctx.ContinueStatementContext,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([
        formatTerminal(node.KW_CONTINUE(), "continue"),
        space,
        formatTerminal(node.KW_LOOP(), "loop"),
        formatTerminal(node.SEMICOLON(), ";"),
    ]);
}

export function formatExitStatement(
    node: ctx.ExitStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([
        formatTerminal(node.KW_EXIT(), "exit"),
        space,
        formatTerminal(node.KW_RETURNING(), "returning"),
        space,
        visit(node.exprSingle()),
        formatTerminal(node.SEMICOLON(), ";"),
    ]);
}

export function formatFlworStatement(
    node: ctx.FlworStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const clauses: Doc[] = [];
    for (let index = 0; index < node.getChildCount(); index++) {
        const child = node.getChild(index);
        if (child !== null && child !== node.KW_RETURN() && child !== node.statement()) {
            const clause = visit(child);
            if (!isEmpty(clause)) {
                clauses.push(clause);
            }
        }
    }
    return concat([
        join(hardline, clauses),
        hardline,
        formatTerminal(node.KW_RETURN(), "return"),
        space,
        visit(node.statement()),
    ]);
}

export function formatIfStatement(
    node: ctx.IfStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const thenStatement = node.statement(0);
    const elseStatement = node.statement(1);
    const thenBranch = visit(thenStatement);
    const elseBranch = visit(elseStatement);
    const thenIsBlock = thenStatement?.blockStatement() !== null;
    const elseIsBlock = elseStatement?.blockStatement() !== null;
    return group(
        concat([
            formatTerminal(node.KW_IF(), "if"),
            space,
            formatTerminal(node.LPAREN(), "("),
            visit(node.expr()),
            formatTerminal(node.RPAREN(), ")"),
            space,
            formatTerminal(node.KW_THEN(), "then"),
            thenIsBlock ? concat([space, thenBranch]) : indent(concat([line, thenBranch])),
            thenIsBlock ? space : line,
            formatTerminal(node.KW_ELSE(), "else"),
            elseIsBlock ? concat([space, elseBranch]) : indent(concat([line, elseBranch])),
        ]),
    );
}

export function formatSwitchStatement(
    node: ctx.SwitchStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const cases = node.switchCaseStatement().map(visit);
    const defaultCase = concat([
        formatTerminal(node.KW_DEFAULT(), "default"),
        space,
        formatTerminal(node.KW_RETURN(), "return"),
        space,
        visit(node.statement()),
    ]);
    return concat([
        formatTerminal(node.KW_SWITCH(), "switch"),
        space,
        formatTerminal(node.LPAREN(), "("),
        visit(node.expr()),
        formatTerminal(node.RPAREN(), ")"),
        indent(concat([hardline, join(hardline, cases), hardline, defaultCase])),
    ]);
}

export function formatSwitchCaseStatement(
    node: ctx.SwitchCaseStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const conditions = node.exprSingle().map(visit);
    const caseDocs = conditions.flatMap((condition) => [
        formatTerminal(node.KW_CASE(), "case"),
        space,
        condition,
        space,
    ]);
    return concat([
        ...caseDocs,
        formatTerminal(node.KW_RETURN(), "return"),
        space,
        visit(node.statement()),
    ]);
}

export function formatTryCatchStatement(
    node: ctx.TryCatchStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([
        formatTerminal(node.KW_TRY(), "try"),
        space,
        visit(node.blockStatement()),
        hardline,
        join(hardline, node.catchCaseStatement().map(visit)),
    ]);
}

export function formatCatchCaseStatement(
    node: ctx.CatchCaseStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const targets = node.nameTest().map(visit);
    return concat([
        formatTerminal(node.KW_CATCH(), "catch"),
        space,
        formatTokenSeparatedDocs(
            targets,
            node.VBAR(),
            (bar) => concat([space, formatTerminal(bar, "|"), space]),
            NIL,
        ),
        space,
        visit(node.blockStatement()),
    ]);
}

export function formatTypeswitchStatement(
    node: ctx.TypeSwitchStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const cases = node.caseStatement().map(visit);
    const binding = node.varBinding() ? concat([space, visit(node.varBinding())]) : NIL;
    const defaultCase = concat([
        formatTerminal(node.KW_DEFAULT(), "default"),
        binding,
        space,
        formatTerminal(node.KW_RETURN(), "return"),
        space,
        visit(node.statement()),
    ]);
    return concat([
        formatTerminal(node.KW_TYPESWITCH(), "typeswitch"),
        space,
        formatTerminal(node.LPAREN(), "("),
        visit(node.expr()),
        formatTerminal(node.RPAREN(), ")"),
        indent(concat([hardline, join(hardline, cases), hardline, defaultCase])),
    ]);
}

export function formatCaseStatement(
    node: ctx.CaseStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const binding = node.varBinding()
        ? concat([visit(node.varBinding()), space, formatTerminal(node.KW_AS(), "as"), space])
        : NIL;
    const types = node.sequenceType().map(visit);
    return concat([
        formatTerminal(node.KW_CASE(), "case"),
        space,
        binding,
        formatTokenSeparatedDocs(
            types,
            node.VBAR(),
            (bar) => concat([space, formatTerminal(bar, "|"), space]),
            NIL,
        ),
        space,
        formatTerminal(node.KW_RETURN(), "return"),
        space,
        visit(node.statement()),
    ]);
}

export function formatVariableDeclarationStatement(
    node: ctx.VarDeclStatementContext,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const annotations = visit(node.annotations());
    return concat([
        annotations,
        isEmpty(annotations) ? NIL : space,
        formatTerminal(node.KW_VARIABLE(), "variable"),
        space,
        formatTokenSeparatedDocs(
            node.varDeclForStatement().map(visit),
            node.getTokens(commaTokenType),
            (comma) => formatTerminal(comma, ","),
        ),
        formatTerminal(node.SEMICOLON(), ";"),
    ]);
}

export function formatVariableDeclarationForStatement(
    node: ctx.VarDeclForStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const sequenceType = node.sequenceType()
        ? concat([space, formatTerminal(node.KW_AS(), "as"), space, visit(node.sequenceType())])
        : NIL;
    const value = node.exprSingle()
        ? concat([space, formatTerminal(node.COLON_EQ(), ":="), space, visit(node.exprSingle())])
        : NIL;
    return concat([visit(node.varBinding()), sequenceType, value]);
}

export function formatWhileStatement(
    node: ctx.WhileStatementContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const statement = node.statement();
    const body = visit(statement);
    const bodyContent = statement.blockStatement()
        ? concat([space, body])
        : indent(concat([line, body]));
    return group(
        concat([
            formatTerminal(node.KW_WHILE(), "while"),
            space,
            formatTerminal(node.LPAREN(), "("),
            visit(node.expr()),
            formatTerminal(node.RPAREN(), ")"),
            bodyContent,
        ]),
    );
}

export function formatBlockExpression(
    node: ctx.BlockExprContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return formatStatementBlock(
        formatTerminal(node.LBRACE(), "{"),
        visit(node.statementsAndExpr()),
        formatTerminal(node.RBRACE(), "}"),
    );
}

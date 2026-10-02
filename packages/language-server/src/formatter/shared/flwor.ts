import type { ParseTree, ParserRuleContext, TerminalNode, Token } from "antlr4ng";
import type * as ctx from "server/parser/context.js";

import { concat, type Doc, group, NIL, space } from "../doc.js";
import { formatFlworExpressionDoc } from "../helpers.js";
import { formatTokenSeparatedDocs } from "./tokens.js";

type SourceTerminal = TerminalNode | TerminalNode[] | Token | null | undefined;
type FormatTerminal = (terminal: SourceTerminal, expectedToken: number | string) => Doc;
type Visit = (node: ParseTree | null | undefined) => Doc;

export function formatFlworExpression(
    node: ctx.FlworExprContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const clauses: Doc[] = [];
    for (let index = 0; index < node.getChildCount(); index++) {
        const child = node.getChild(index);
        if (child === null || child === node.KW_RETURN() || child === node._return_expr) {
            continue;
        }
        const clause = visit(child);
        if (clause.kind !== "text" || clause.text !== "") {
            clauses.push(clause);
        }
    }
    return group(
        formatFlworExpressionDoc(
            clauses,
            formatTerminal(node.KW_RETURN(), "return"),
            visit(node._return_expr),
        ),
    );
}

function formatCommaSeparatedChildren(
    node: ParserRuleContext,
    items: readonly ParseTree[],
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return formatTokenSeparatedDocs(items.map(visit), node.getTokens(commaTokenType), (comma) =>
        formatTerminal(comma, ","),
    );
}

export function formatForClause(
    node: ctx.ForClauseContext,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        concat([
            formatTerminal(node.KW_FOR(), "for"),
            space,
            formatCommaSeparatedChildren(node, node._vars, commaTokenType, visit, formatTerminal),
        ]),
    );
}

export function formatForVariable(
    node: ctx.ForVarContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const sequenceType = node._seq
        ? concat([space, formatTerminal(node.KW_AS(), "as"), space, visit(node._seq)])
        : NIL;
    const allowingEmpty = node.allowingEmpty() ? concat([space, visit(node.allowingEmpty())]) : NIL;
    const positionalVariable = node._at
        ? concat([space, formatTerminal(node.KW_AT(), "at"), space, visit(node._at)])
        : NIL;
    return concat([
        visit(node._var_ref),
        sequenceType,
        allowingEmpty,
        positionalVariable,
        space,
        formatTerminal(node.KW_IN(), "in"),
        space,
        visit(node._ex),
    ]);
}

export function formatLetClause(
    node: ctx.LetClauseContext,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        concat([
            formatTerminal(node.KW_LET(), "let"),
            space,
            formatCommaSeparatedChildren(node, node._vars, commaTokenType, visit, formatTerminal),
        ]),
    );
}

export function formatLetVariable(
    node: ctx.LetVarContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const sequenceType = node._seq
        ? concat([space, formatTerminal(node.KW_AS(), "as"), space, visit(node._seq)])
        : NIL;
    return concat([
        visit(node._var_ref),
        sequenceType,
        space,
        formatTerminal(node.COLON_EQ(), ":="),
        space,
        visit(node._ex),
    ]);
}

export function formatWhereClause(
    node: ctx.WhereClauseContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([formatTerminal(node.KW_WHERE(), "where"), space, visit(node.exprSingle())]);
}

export function formatGroupByClause(
    node: ctx.GroupByClauseContext,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        concat([
            formatTerminal(node.KW_GROUP(), "group"),
            space,
            formatTerminal(node.KW_BY(), "by"),
            space,
            formatCommaSeparatedChildren(node, node._vars, commaTokenType, visit, formatTerminal),
        ]),
    );
}

export function formatGroupByVariable(
    node: ctx.GroupByVarContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const sequenceType = node._seq
        ? concat([space, formatTerminal(node.KW_AS(), "as"), space, visit(node._seq)])
        : NIL;
    const expression = node._ex
        ? concat([space, formatTerminal(node.COLON_EQ(), ":="), space, visit(node._ex)])
        : NIL;
    return concat([visit(node._var_ref), sequenceType, expression]);
}

export function formatOrderByClause(
    node: ctx.OrderByClauseContext,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const stable = node.KW_STABLE()
        ? concat([formatTerminal(node.KW_STABLE(), "stable"), space])
        : NIL;
    return group(
        concat([
            stable,
            formatTerminal(node.KW_ORDER(), "order"),
            space,
            formatTerminal(node.KW_BY(), "by"),
            space,
            formatCommaSeparatedChildren(node, node._specs, commaTokenType, visit, formatTerminal),
        ]),
    );
}

export function formatCountClause(
    node: ctx.CountClauseContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([formatTerminal(node.KW_COUNT(), "count"), space, visit(node.varBinding())]);
}

export function formatExpressionSequence(
    node: ctx.ExprContext,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        formatCommaSeparatedChildren(
            node,
            node.exprSingle(),
            commaTokenType,
            visit,
            formatTerminal,
        ),
    );
}

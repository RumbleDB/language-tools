import type * as ctx from "server/parser/context.js";

import { concat, type Doc, group, hardline, indent, join, NIL, space } from "../doc.js";
import { formatCommaSeparatedDocs } from "./tokens.js";
import type { FormatTerminal, Visit } from "./types.js";

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
    const returnClause = formatIntroducedExpression(
        formatTerminal(node.KW_RETURN(), "return"),
        node._return_expr,
        visit,
    );
    return join(hardline, [...clauses, returnClause]);
}

/**
 * Formats an expression after the keyword or operator that introduces it, such as `:=`, `in` or `return`. A FLWOR
 * expression starts on its own line, indented, so that its clauses are not read as those of the enclosing FLWOR.
 */
export function formatIntroducedExpression(
    introducer: Doc,
    expression: ctx.ExprSingleContext | null | undefined,
    visit: Visit,
): Doc {
    if (expression?.flworExpr()) {
        return concat([introducer, indent(concat([hardline, visit(expression)]))]);
    }
    return concat([introducer, space, visit(expression)]);
}

export function formatForClause(
    node: ctx.ForClauseContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        concat([
            formatTerminal(node.KW_FOR(), "for"),
            space,
            formatCommaSeparatedDocs(node._vars.map(visit), node.COMMA(), formatTerminal),
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
        formatIntroducedExpression(formatTerminal(node.KW_IN(), "in"), node._ex, visit),
    ]);
}

export function formatLetClause(
    node: ctx.LetClauseContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        concat([
            formatTerminal(node.KW_LET(), "let"),
            space,
            formatCommaSeparatedDocs(node._vars.map(visit), node.COMMA(), formatTerminal),
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
        formatIntroducedExpression(formatTerminal(node.COLON_EQ(), ":="), node._ex, visit),
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
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        concat([
            formatTerminal(node.KW_GROUP(), "group"),
            space,
            formatTerminal(node.KW_BY(), "by"),
            space,
            formatCommaSeparatedDocs(node._vars.map(visit), node.COMMA(), formatTerminal),
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
    const collation = node._uri
        ? concat([space, formatTerminal(node.KW_COLLATION(), "collation"), space, visit(node._uri)])
        : NIL;
    return concat([visit(node._var_ref), sequenceType, expression, collation]);
}

export function formatOrderByClause(
    node: ctx.OrderByClauseContext,
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
            formatCommaSeparatedDocs(node._specs.map(visit), node.COMMA(), formatTerminal),
        ]),
    );
}

/**
 * Formats the window of a `for tumbling window` or `for sliding window` clause, with its start and end conditions
 * on lines of their own:
 * ```
 * for sliding window $w in $readings
 *     start at $first when true()
 *     only end at $last when $last - $first eq 2
 * ```
 */
export function formatWindowClause(
    kind: Doc,
    node: ctx.TumblingWindowClauseContext | ctx.SlidingWindowClauseContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const type = node._type_ ? concat([space, visit(node._type_)]) : NIL;
    const conditions = [node.windowStartCondition(), node.windowEndCondition()].map((condition) =>
        condition ? concat([hardline, visit(condition)]) : NIL,
    );
    return concat([
        kind,
        space,
        formatTerminal(node.KW_WINDOW(), "window"),
        space,
        visit(node._name),
        type,
        space,
        formatIntroducedExpression(formatTerminal(node.KW_IN(), "in"), node.exprSingle(), visit),
        indent(concat(conditions)),
    ]);
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
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        formatCommaSeparatedDocs(node.exprSingle().map(visit), node.COMMA(), formatTerminal),
    );
}

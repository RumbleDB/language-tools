import type { TerminalNode } from "antlr4ng";
import type * as ctx from "server/parser/context.js";

import { composeTokenDoc, type TokenDoc } from "../context.js";
import { concat, type Doc, indent, line, softline, space } from "../doc.js";
import { groupStartingWith } from "../helpers.js";
import { formatCommaSeparatedDocs } from "./tokens.js";
import type { FormatTerminal, FormatToken, Visit } from "./types.js";

interface BracketedListOptions {
    /** The line inside the brackets: `line` spaces them, as in `[ 1, 2 ]`, and `softline` does not, as in `(1, 2)`. */
    readonly padding?: Doc;
    /** Puts one item per line even when the list fits on one, because the source does. */
    readonly expanded?: boolean;
}

/**
 * Formats a comma-separated list between an opening and a closing token. It is on one line when it fits, and has one
 * item per line otherwise.
 */
export function formatBracketedList(
    opening: TokenDoc,
    items: readonly Doc[],
    commas: readonly TerminalNode[],
    closing: Doc,
    formatTerminal: FormatTerminal,
    { padding = line, expanded = false }: BracketedListOptions = {},
): Doc {
    if (items.length === 0) {
        return concat([composeTokenDoc(opening), closing]);
    }
    return groupStartingWith(
        opening,
        concat([
            indent(concat([padding, formatCommaSeparatedDocs(items, commas, formatTerminal)])),
            padding,
            closing,
        ]),
        { shouldBreak: expanded },
    );
}

export function formatSquareArrayConstructor(
    node: ctx.SquareArrayConstructorContext,
    visit: Visit,
    formatToken: FormatToken,
    formatTerminal: FormatTerminal,
): Doc {
    return formatBracketedList(
        formatToken(node.LBRACKET(), "["),
        node.exprSingle().map(visit),
        node.COMMA(),
        formatTerminal(node.RBRACKET(), "]"),
        formatTerminal,
    );
}

export function formatCurlyArrayConstructor(
    node: ctx.CurlyArrayConstructorContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([
        formatTerminal(node.KW_ARRAY(), "array"),
        space,
        visit(node.enclosedExpression()),
    ]);
}

export function formatPostfixExpression(node: ctx.PostfixExprContext, visit: Visit): Doc {
    const parts: Doc[] = [];
    for (let index = 0; index < node.getChildCount(); index++) {
        parts.push(visit(node.getChild(index)));
    }
    return concat(parts);
}

export function formatParenthesizedExpression(
    node: ctx.ParenthesizedExprContext,
    visit: Visit,
    formatToken: FormatToken,
    formatTerminal: FormatTerminal,
): Doc {
    const expression = node.expr();
    return formatBracketedList(
        formatToken(node.LPAREN(), "("),
        expression?.exprSingle().map(visit) ?? [],
        // The commas separate the items of the inner expression, so they are its tokens.
        expression?.COMMA() ?? [],
        formatTerminal(node.RPAREN(), ")"),
        formatTerminal,
        { padding: softline },
    );
}

export function formatFunctionCall(node: ctx.FunctionCallContext, visit: Visit): Doc {
    return concat([visit(node._fn_name), visit(node.argumentList())]);
}

export function formatArgumentList(
    node: ctx.ArgumentListContext,
    visit: Visit,
    formatToken: FormatToken,
    formatTerminal: FormatTerminal,
): Doc {
    return formatBracketedList(
        formatToken(node.LPAREN(), "("),
        node.argument().map(visit),
        node.COMMA(),
        formatTerminal(node.RPAREN(), ")"),
        formatTerminal,
        { padding: softline },
    );
}

export function formatArgument(
    node: ctx.ArgumentContext,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return node.QUESTION() !== null
        ? formatTerminal(node.QUESTION(), "?")
        : visit(node.exprSingle());
}

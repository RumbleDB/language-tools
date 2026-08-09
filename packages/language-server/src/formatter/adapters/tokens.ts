import type { TerminalNode, Token } from "antlr4ng";

import type { FormatterContext, TokenDoc } from "../context.js";
import { concat, type Doc, line, NIL } from "../doc.js";
import { getTokenLiteral } from "../helpers.js";

export type SourceTerminal = TerminalNode | Token | null | undefined;

/** Formats a real source token, with a synthetic fallback for generated accessors. */
export function formatTokenDoc(
    context: FormatterContext,
    terminal: SourceTerminal | SourceTerminal[],
    expectedToken: number | string,
    literalNames: (string | null)[],
): TokenDoc {
    if (Array.isArray(terminal)) {
        terminal = terminal[0] ?? null;
    }
    if (terminal) {
        return context.formatToken(terminal);
    }

    const expected =
        typeof expectedToken === "number"
            ? getTokenLiteral(expectedToken, literalNames)
            : expectedToken;
    return context.formatSyntheticToken(expected);
}

/** Joins items using real separator tokens, preserving attached comments. */
export function formatTokenSeparatedDocs(
    items: readonly Doc[],
    separators: readonly SourceTerminal[],
    formatSeparator: (separator: SourceTerminal) => Doc,
    breakDoc: Doc = line,
): Doc {
    if (items.length === 0) {
        return NIL;
    }

    const docs: Doc[] = [items[0]!];
    for (let index = 1; index < items.length; index++) {
        docs.push(formatSeparator(separators[index - 1]), breakDoc, items[index]!);
    }
    return concat(docs);
}

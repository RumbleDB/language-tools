import type { ParseTree, TerminalNode, Token } from "antlr4ng";

import type { TokenDoc } from "../context.js";
import type { Doc } from "../doc.js";

/**
 * A source token, as a generated accessor returns it: null when the parser recovered without it, and a list for a
 * token that the rule repeats, of which the first is formatted.
 */
export type SourceTerminal = TerminalNode | TerminalNode[] | Token | null | undefined;

/** Formats a source token, or the text of the expected token when the parser recovered without it. */
export type FormatTerminal = (terminal: SourceTerminal, expectedToken: number | string) => Doc;

/** Like {@link FormatTerminal}, with the comments of the token apart, to place them outside a layout group. */
export type FormatToken = (terminal: SourceTerminal, expectedToken: number | string) => TokenDoc;

/** Formats a node of the parse tree. */
export type Visit = (node: ParseTree | null | undefined) => Doc;

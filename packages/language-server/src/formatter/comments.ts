import type { Token } from "antlr4ng";

import type { FormatterContext } from "./context.js";

/**
 * Determines if a comment is an inline comment (was on the same line as code)
 * or a standalone block comment (on its own line).
 */
export function isInlineComment(comment: Token, ctx: FormatterContext): boolean {
    // Check if there's a non-whitespace default-channel token on the same line before this comment
    for (let i = comment.tokenIndex - 1; i >= 0; i--) {
        const token = ctx.tokenStream.get(i);
        if (token.text !== null && token.text !== undefined && token.text.includes("\n")) {
            return false;
        }
        if (token.channel === 0 /* DEFAULT_CHANNEL */) {
            return true;
        }
    }
    return false;
}

/**
 * Formats comments that appear between two tokens, returning them as a string
 * to be inserted in the formatted output.
 *
 * @param comments - The comment tokens to format
 * @param ctx - The formatter context (for indentation)
 * @param inline - Whether these comments should be placed inline or on their own lines
 * @returns Formatted comment string to insert
 */
export function formatComments(comments: Token[], ctx: FormatterContext, inline: boolean): string {
    if (comments.length === 0) {
        return "";
    }

    const parts: string[] = [];
    for (const comment of comments) {
        const text = comment.text?.trim() ?? "";
        if (text === "") {
            continue;
        }

        if (inline) {
            parts.push(` ${text}`);
        } else {
            parts.push(`${ctx.currentIndent}${text}`);
        }
    }

    if (inline) {
        return parts.join("");
    }
    return parts.length > 0 ? "\n" + parts.join("\n") + "\n" : "";
}

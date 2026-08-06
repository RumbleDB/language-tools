import { CommonTokenStream, Token } from "antlr4ng";

import type { FormatterContext } from "./context.js";

export interface CommentAttachmentMap {
    leading: Map<number, Token[]>;
    trailing: Map<number, Token[]>;
    dangling: Token[];
}

function hasNewlineBetween(
    tokenStream: CommonTokenStream,
    prevIdx: number,
    commentIdx: number,
): boolean {
    const previous = tokenStream.get(prevIdx);
    const comment = tokenStream.get(commentIdx);
    const sourceText = previous.inputStream?.getTextFromRange(previous.stop + 1, comment.start - 1);
    if (sourceText?.includes("\n")) {
        return true;
    }
    if (previous.line < comment.line) {
        return true;
    }

    for (let i = prevIdx + 1; i < commentIdx; i++) {
        const t = tokenStream.get(i);
        if (t.text !== null && t.text !== undefined && t.text.includes("\n")) {
            return true;
        }
    }
    return false;
}

/**
 * Returns whether a comment belongs to the preceding line of code.
 *
 * Comments and whitespace are both hidden-channel tokens, so the presence of a
 * newline between the preceding default-channel token and the comment is the
 * only distinction needed here. Keeping this test alongside attachment logic
 * ensures the legacy inter-token helper and the visitor use the same rule.
 */
export function isInlineComment(comment: Token, ctx: FormatterContext): boolean {
    for (let i = comment.tokenIndex - 1; i >= 0; i--) {
        const token = ctx.tokenStream.get(i);
        if (token.text?.includes("\n")) {
            return false;
        }
        if (token.channel === Token.DEFAULT_CHANNEL && token.type !== Token.EOF) {
            return !token.inputStream
                ?.getTextFromRange(token.stop + 1, comment.start - 1)
                .includes("\n");
        }
    }
    return false;
}

/**
 * Scans all HIDDEN channel comments and attaches each comment as either:
 * - trailing (on the same line as preceding default-channel token)
 * - leading (on a line before succeeding default-channel token)
 * - dangling (end of document or no surrounding tokens)
 */
export function buildCommentAttachmentMap(tokenStream: CommonTokenStream): CommentAttachmentMap {
    const leading = new Map<number, Token[]>();
    const trailing = new Map<number, Token[]>();
    const dangling: Token[] = [];

    const size = tokenStream.size;
    if (size === 0) {
        return { leading, trailing, dangling };
    }

    for (let i = 0; i < size; i++) {
        const tok = tokenStream.get(i);
        if (tok.channel !== 1 || !tok.text?.trim().startsWith("(:")) {
            continue;
        }

        // Find preceding default token
        let prevIdx = -1;
        for (let j = i - 1; j >= 0; j--) {
            const t = tokenStream.get(j);
            if (t.channel === Token.DEFAULT_CHANNEL && t.type !== -1 /* Token.EOF */) {
                prevIdx = j;
                break;
            }
        }

        // Find succeeding default token
        let nextIdx = -1;
        for (let j = i + 1; j < size; j++) {
            const t = tokenStream.get(j);
            if (t.channel === Token.DEFAULT_CHANNEL && t.type !== -1 /* Token.EOF */) {
                nextIdx = j;
                break;
            }
        }

        if (prevIdx !== -1) {
            const isInline = !hasNewlineBetween(tokenStream, prevIdx, i);
            if (isInline) {
                const list = trailing.get(prevIdx) ?? [];
                list.push(tok);
                trailing.set(prevIdx, list);
                continue;
            }
        }

        if (nextIdx !== -1) {
            const list = leading.get(nextIdx) ?? [];
            list.push(tok);
            leading.set(nextIdx, list);
            continue;
        }

        dangling.push(tok);
    }

    return { leading, trailing, dangling };
}

export function formatSingleComment(comment: Token, isInline: boolean, indent: string): string {
    const text = comment.text?.trim() ?? "";
    if (!text) {
        return "";
    }
    if (isInline) {
        return ` ${text}`;
    }
    return `${indent}${text}\n`;
}

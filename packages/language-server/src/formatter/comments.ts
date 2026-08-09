import { CommonTokenStream, Token } from "antlr4ng";

export interface CommentAttachmentMap {
    leading: Map<number, Token[]>;
    trailing: Map<number, Token[]>;
    dangling: Token[];
}

/**
 * Checks whether there is a newline character between two token positions in
 * the token stream (exclusive of both endpoints).
 *
 * We scan the hidden-channel tokens (whitespace / comments) between prevIdx
 * and commentIdx because the standard Token.line property is unreliable for
 * hidden-channel tokens in antlr4ng — line numbers are only incremented by
 * the lexer for tokens that are actually consumed, and skipped WS tokens may
 * share a line number with the following visible token.
 *
 * We prefer the CharStream text slice when available (most accurate), with the
 * hidden-token scan as the fallback.
 */
function hasNewlineBetween(
    tokenStream: CommonTokenStream,
    prevIdx: number,
    commentIdx: number,
): boolean {
    const previous = tokenStream.get(prevIdx);
    const comment = tokenStream.get(commentIdx);

    // Primary: inspect the raw source characters between the two tokens.
    const text = previous.inputStream?.getTextFromRange(previous.stop + 1, comment.start - 1);
    if (text !== null && text !== undefined) {
        return text.includes("\n");
    }

    // Fallback: walk the hidden-channel tokens between the two indices.
    for (let i = prevIdx + 1; i < commentIdx; i++) {
        const t = tokenStream.get(i);
        if (t.text?.includes("\n")) {
            return true;
        }
    }
    return false;
}

/**
 * Scans all HIDDEN channel comments and attaches each comment as either:
 * - trailing: on the same line as the preceding default-channel token
 * - leading:  on its own line before the succeeding default-channel token
 * - dangling: after the last default-channel token (EOF comments)
 */
export function buildCommentAttachmentMap(tokenStream: CommonTokenStream): CommentAttachmentMap {
    const leading = new Map<number, Token[]>();
    const trailing = new Map<number, Token[]>();
    const dangling: Token[] = [];

    const size = tokenStream.size;
    if (size === 0) {
        return { leading, trailing, dangling };
    }

    let previousDefaultIndex = -1;
    let pendingLeading: Token[] = [];

    for (let i = 0; i < size; i++) {
        const tok = tokenStream.get(i);
        if (tok.channel === Token.DEFAULT_CHANNEL && tok.type !== Token.EOF) {
            if (pendingLeading.length > 0) {
                leading.set(i, pendingLeading);
                pendingLeading = [];
            }
            previousDefaultIndex = i;
            continue;
        }
        if (tok.channel !== Token.HIDDEN_CHANNEL || !tok.text?.trim().startsWith("(:")) {
            continue;
        }

        if (
            previousDefaultIndex !== -1 &&
            !hasNewlineBetween(tokenStream, previousDefaultIndex, i)
        ) {
            // Trailing comment: same line as preceding token
            const list = trailing.get(previousDefaultIndex) ?? [];
            list.push(tok);
            trailing.set(previousDefaultIndex, list);
            continue;
        }

        // The next default-channel token will claim this leading comment.
        pendingLeading.push(tok);
    }

    // No default-channel token followed these comments.
    dangling.push(...pendingLeading);

    return { leading, trailing, dangling };
}

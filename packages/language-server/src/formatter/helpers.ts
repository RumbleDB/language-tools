import type { TokenDoc } from "./context.js";
import { concat, Doc, group, hardline, indent, join, line, space } from "./doc.js";

/**
 * Starts a layout group with a source token while keeping that token's leading
 * comments outside the group. The token itself and trailing comments remain
 * part of the group's layout decision.
 */
export function groupStartingWith(first: TokenDoc, rest: Doc): Doc {
    return concat([first.leading, group(concat([first.value, first.trailing, rest]))]);
}

// ─── Lexer Token Literal Helper ───────────────────────────────────────────────

/**
 * Resolves the literal string representation of a token type from a Lexer's literalNames array.
 * E.g., for KW_FUNCTION with "'function'", returns "function".
 */
export function getTokenLiteral(tokenType: number, literalNames: (string | null)[]): string {
    const raw = literalNames[tokenType];
    if (!raw) {
        return "";
    }
    if (raw.startsWith("'") && raw.endsWith("'")) {
        return raw.slice(1, -1);
    }
    return raw;
}

// ─── Block Formatting ─────────────────────────────────────────────────────────

/**
 * Formats a brace-enclosed block `{ content }`.
 * When flat: `{ content }`
 * When broken:
 * ```
 * {
 *     content
 * }
 * ```
 */
export function formatBlockDoc(leftBrace: Doc, doc: Doc, rightBrace: Doc): Doc {
    if (doc.kind === "text" && doc.text === "") {
        return concat([leftBrace, rightBrace]);
    }
    return group(concat([leftBrace, indent(concat([line, doc])), line, rightBrace]));
}

// ─── FLWOR Formatting ─────────────────────────────────────────────────────────

/**
 * Formats a FLWOR expression with each clause separated by a hard line break.
 */
export function formatFlworExpressionDoc(
    clauses: readonly Doc[],
    returnKeywordDoc: Doc,
    returnExprDoc: Doc,
): Doc {
    const returnLine = concat([returnKeywordDoc, space, returnExprDoc]);
    return join(hardline, [...clauses, returnLine]);
}

// ─── If/Else Formatting ──────────────────────────────────────────────────────

/**
 * Formats an if/then/else expression.
 * All keyword Docs (ifKw, thenKw, elseKw) and punctuation Docs (lparenDoc, rparenDoc)
 * should come from the visitor's kw() helper so comment attachment is preserved.
 */
export function formatIfExpressionDoc(
    ifKw: Doc,
    lparenDoc: Doc,
    condDoc: Doc,
    rparenDoc: Doc,
    thenKw: Doc,
    thenDoc: Doc,
    elseKw: Doc,
    elseDoc: Doc,
): Doc {
    return group(
        concat([
            ifKw,
            space,
            lparenDoc,
            condDoc,
            rparenDoc,
            indent(concat([line, thenKw, space, thenDoc, line, elseKw, space, elseDoc])),
        ]),
    );
}

// ─── Try/Catch Formatting ─────────────────────────────────────────────────────

/**
 * Formats a try/catch expression.
 */
export function formatTryCatchDoc(
    tryKw: Doc,
    leftBrace: Doc,
    tryBodyDoc: Doc,
    rightBrace: Doc,
    catchClausesDocs: readonly Doc[],
): Doc {
    const tryBlock = formatBlockDoc(leftBrace, tryBodyDoc, rightBrace);
    const parts: Doc[] = [concat([tryKw, space, tryBlock])];
    for (const c of catchClausesDocs) {
        parts.push(c);
    }
    return join(hardline, parts);
}

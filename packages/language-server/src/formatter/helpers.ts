import { concat, Doc, group, hardline, indent, join, line, NIL, text } from "./doc.js";

// ─── List Formatting ─────────────────────────────────────────────────────────

/**
 * Formats a comma-separated list of items (sequence items, arguments, params).
 * If the group breaks across lines, items are separated by `, \n`.
 */
export function formatCommaSeparatedDocs(items: readonly Doc[]): Doc {
    if (items.length === 0) {
        return NIL;
    }
    return join(concat([text(","), line]), items);
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
export function formatBlockDoc(content: Doc): Doc {
    if (content.kind === "text" && content.text === "") {
        return text("{}");
    }
    return group(concat([text("{"), indent(concat([line, content])), line, text("}")]));
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
    const returnLine = concat([returnKeywordDoc, text(" "), returnExprDoc]);
    return join(hardline, [...clauses, returnLine]);
}

// ─── If/Else Formatting ──────────────────────────────────────────────────────

/**
 * Formats an if/then/else expression.
 * When flat: `if ($cond) then $a else $b`
 * When broken:
 * ```
 * if ($cond)
 *     then $a
 *     else $b
 * ```
 */
export function formatIfExpressionDoc(condDoc: Doc, thenDoc: Doc, elseDoc: Doc): Doc {
    return group(
        concat([
            text("if ("),
            condDoc,
            text(")"),
            indent(concat([line, text("then "), thenDoc, line, text("else "), elseDoc])),
        ]),
    );
}

// ─── Try/Catch Formatting ─────────────────────────────────────────────────────

/**
 * Formats a try/catch expression.
 */
export function formatTryCatchDoc(tryBodyDoc: Doc, catchClausesDocs: readonly Doc[]): Doc {
    const tryBlock = formatBlockDoc(tryBodyDoc);
    const parts: Doc[] = [concat([text("try "), tryBlock])];
    for (const c of catchClausesDocs) {
        parts.push(concat([text(" "), c]));
    }
    return join(line, parts);
}

// ─── Blank Line Normalization ─────────────────────────────────────────────────

/**
 * Post-processes printer text output to normalize blank lines and trim trailing spaces.
 */
export function normalizeBlankLines(textStr: string, maxConsecutive: number): string {
    const lines = textStr.split("\n");
    const result: string[] = [];
    let consecutiveBlanks = 0;

    for (const l of lines) {
        const trimmed = l.trimEnd();
        if (trimmed === "") {
            consecutiveBlanks += 1;
            if (consecutiveBlanks <= maxConsecutive) {
                result.push("");
            }
        } else {
            consecutiveBlanks = 0;
            result.push(trimmed);
        }
    }

    return result.join("\n");
}

// ─── Declaration Separation ────────────────────────────────────────────────────

/**
 * Determines if two consecutive prolog declarations should have a blank line between them.
 */
export function shouldSeparateDeclarations(prev: string, current: string): boolean {
    return getDeclarationType(prev) !== getDeclarationType(current);
}

type DeclarationType =
    | "import"
    | "namespace"
    | "setter"
    | "variable"
    | "function"
    | "type"
    | "option"
    | "context"
    | "other";

function getDeclarationType(decl: string): DeclarationType {
    const trimmed = decl.trimStart();
    if (trimmed.startsWith("import")) {
        return "import";
    }
    if (trimmed.startsWith("declare namespace") || trimmed.startsWith("declare default")) {
        return "namespace";
    }
    if (trimmed.startsWith("declare variable")) {
        return "variable";
    }
    if (trimmed.startsWith("declare function") || trimmed.startsWith("declare %")) {
        return "function";
    }
    if (trimmed.startsWith("declare type")) {
        return "type";
    }
    if (trimmed.startsWith("declare option")) {
        return "option";
    }
    if (trimmed.startsWith("declare context")) {
        return "context";
    }
    if (
        trimmed.startsWith("declare boundary-space") ||
        trimmed.startsWith("declare default collation") ||
        trimmed.startsWith("declare base-uri") ||
        trimmed.startsWith("declare construction") ||
        trimmed.startsWith("declare ordering") ||
        trimmed.startsWith("declare default order") ||
        trimmed.startsWith("declare copy-namespaces") ||
        trimmed.startsWith("declare decimal-format")
    ) {
        return "setter";
    }
    return "other";
}

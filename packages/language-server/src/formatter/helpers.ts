import type { FormatterContext } from "./context.js";

// ─── Spacing Helpers ──────────────────────────────────────────────────────────

/**
 * Joins formatted parts with a single space, filtering out empty strings.
 */
export function spaced(...parts: (string | null | undefined)[]): string {
    return parts.filter((p): p is string => p !== null && p !== undefined && p !== "").join(" ");
}

// ─── Comma-Separated Lists ───────────────────────────────────────────────────

/**
 * Formats a comma-separated list of items with spacing after commas.
 * Used for argument lists, parameter lists, sequence items, etc.
 *
 * Examples:
 *   formatCommaSeparated(["$x", "$y", "$z"]) => "$x, $y, $z"
 */
export function formatCommaSeparated(items: string[]): string {
    return items.join(", ");
}

// ─── Block Formatting ─────────────────────────────────────────────────────────

/**
 * Formats a brace-enclosed block `{ content }`.
 * If the content is short enough, keeps it on one line.
 * Otherwise, breaks it across multiple lines with indentation.
 */
export function formatBlock(
    content: string,
    ctx: FormatterContext,
    forceMultiLine: boolean = false,
): string {
    const trimmed = content.trim();

    if (trimmed === "") {
        return "{}";
    }

    const singleLine = `{ ${trimmed} }`;
    if (!forceMultiLine && singleLine.length <= ctx.options.maxLineWidth) {
        return singleLine;
    }

    ctx.indent();
    const indentedContent = trimmed
        .split("\n")
        .map((line) => (line.trim() === "" ? "" : `${ctx.currentIndent}${line.trim()}`))
        .join("\n");
    ctx.dedent();

    return `{\n${indentedContent}\n${ctx.currentIndent}}`;
}

// ─── FLWOR Formatting ─────────────────────────────────────────────────────────

/**
 * Formats a FLWOR expression with each clause on its own line.
 *
 * ```
 * for $x in $seq
 * let $y := $x + 1
 * where $y > 5
 * order by $y
 * return $y
 * ```
 */
export function formatFlworExpression(
    clauses: string[],
    returnKeyword: string,
    returnExpr: string,
    ctx: FormatterContext,
): string {
    const parts = clauses.filter((c) => c !== "");
    const returnLine = spaced(returnKeyword, returnExpr);
    parts.push(returnLine);
    return parts.join("\n" + ctx.currentIndent);
}

// ─── If/Else Formatting ──────────────────────────────────────────────────────

/**
 * Formats an if/then/else expression.
 * Short expressions stay on one line; longer ones break across lines.
 *
 * Single line: `if ($cond) then $a else $b`
 * Multi line:
 * ```
 * if ($cond)
 * then $a
 * else $b
 * ```
 */
export function formatIfExpression(
    condition: string,
    thenExpr: string,
    elseExpr: string,
    ctx: FormatterContext,
): string {
    const singleLine = `if (${condition}) then ${thenExpr} else ${elseExpr}`;
    if (
        singleLine.length + ctx.currentIndent.length <= ctx.options.maxLineWidth &&
        !singleLine.includes("\n")
    ) {
        return singleLine;
    }

    return [
        `if (${condition})`,
        `${ctx.currentIndent}then ${thenExpr}`,
        `${ctx.currentIndent}else ${elseExpr}`,
    ].join("\n");
}

// ─── Try/Catch Formatting ─────────────────────────────────────────────────────

/**
 * Formats a try/catch expression.
 *
 * ```
 * try {
 *   expr
 * } catch * {
 *   handler
 * }
 * ```
 */
export function formatTryCatch(
    tryBody: string,
    catchClauses: string[],
    ctx: FormatterContext,
): string {
    const tryBlock = formatBlock(tryBody, ctx);
    const parts = [`try ${tryBlock}`];
    for (const clause of catchClauses) {
        parts.push(ctx.currentIndent + clause);
    }
    return parts.join("\n");
}

// ─── Blank Line Normalization ─────────────────────────────────────────────────

/**
 * Normalizes blank lines in a formatted string.
 * Collapses consecutive blank lines to the specified maximum.
 * Removes trailing whitespace from each line.
 */
export function normalizeBlankLines(text: string, maxConsecutive: number): string {
    const lines = text.split("\n");
    const result: string[] = [];
    let consecutiveBlanks = 0;

    for (const line of lines) {
        const trimmed = line.trimEnd();
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

// ─── Smart Token Joining ──────────────────────────────────────────────────────

/**
 * Joins token parts with smart spacing — adds spaces between most tokens,
 * but not after opening delimiters, before closing delimiters, before commas/semicolons, etc.
 */
export function smartJoin(parts: string[]): string {
    if (parts.length === 0) {
        return "";
    }

    let result = parts[0]!;
    for (let i = 1; i < parts.length; i++) {
        const prev = result;
        const next = parts[i]!;

        if (needsSpaceBetween(prev, next)) {
            result += " " + next;
        } else {
            result += next;
        }
    }
    return result;
}

function needsSpaceBetween(left: string, right: string): boolean {
    if (left === "" || right === "") {
        return false;
    }

    const lastChar = left[left.length - 1]!;
    const firstChar = right[0]!;

    // No space after opening delimiters
    if (lastChar === "(" || lastChar === "[" || lastChar === "{") {
        return false;
    }

    // No space before closing delimiters
    if (firstChar === ")" || firstChar === "]" || firstChar === "}") {
        return false;
    }

    // No space before comma or semicolon
    if (firstChar === "," || firstChar === ";") {
        return false;
    }

    // No space after $ (variable prefix) — but only when $ stands alone,
    // not when it is the last char of a compound token like $$
    if (left === "$") {
        return false;
    }

    // No space after @ (attribute axis shorthand)
    if (lastChar === "@") {
        return false;
    }

    // No space before or after :: (axis separator)
    if (right.startsWith("::") || left.endsWith("::")) {
        return false;
    }

    // No space before or after / and // (path separators)
    if (right === "/" || right === "//" || left === "/" || left === "//") {
        return false;
    }

    // No space before postfix predicate [n] when attached to an expression
    // (dot lookups are handled explicitly in visitPostfixExpr, not via smartJoin)
    if (right.startsWith("[")) {
        return false;
    }

    // No space before or after .. (parent step in XPath)
    if (left === ".." || right === "..") {
        return false;
    }

    // No space before or after # (named function ref arity)
    if (firstChar === "#" || lastChar === "#") {
        return false;
    }

    return true;
}

// ─── Prolog Declaration Separation ────────────────────────────────────────────

/**
 * Determines if two consecutive prolog declarations should have a blank line
 * between them. Related declarations of the same kind are grouped together
 * without a blank line; different kinds get a blank line.
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

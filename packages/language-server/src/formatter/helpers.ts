import { ParserRuleContext, type TerminalNode, Token } from "antlr4ng";

import { isInlineComment } from "./comments.js";
import type { FormatterContext } from "./context.js";

// ─── Token-Level Helpers ──────────────────────────────────────────────────────

/**
 * Returns the first default-channel token in a parse tree subtree.
 */
export function firstToken(node: ParserRuleContext): Token | null {
    if (node.start === null) {
        return null;
    }
    return node.start;
}

/**
 * Returns the last default-channel token in a parse tree subtree.
 */
export function lastToken(node: ParserRuleContext): Token | null {
    if (node.stop === null) {
        return null;
    }
    return node.stop;
}

// ─── Spacing Helpers ──────────────────────────────────────────────────────────

/**
 * Joins formatted parts with a single space, filtering out empty strings.
 */
export function spaced(...parts: (string | null | undefined)[]): string {
    return parts.filter((p): p is string => p !== null && p !== undefined && p !== "").join(" ");
}

/**
 * Joins formatted parts with no separator, filtering out empty strings.
 */
export function concat(...parts: (string | null | undefined)[]): string {
    return parts.filter((p): p is string => p !== null && p !== undefined && p !== "").join("");
}

export function indentLines(text: string, indent: string): string {
    return text
        .split("\n")
        .map((line) => (line.trim() === "" ? "" : `${indent}${line}`))
        .join("\n");
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

/**
 * Formats a comma-separated list wrapped in parentheses.
 *
 * Examples:
 *   formatParenthesizedList(["$x", "$y"]) => "($x, $y)"
 *   formatParenthesizedList([]) => "()"
 */
export function formatParenthesizedList(items: string[]): string {
    if (items.length === 0) {
        return "()";
    }
    return `(${formatCommaSeparated(items)})`;
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

// ─── Switch/Typeswitch Formatting ─────────────────────────────────────────────

/**
 * Formats a switch/typeswitch case clause.
 */
export function formatCaseClause(
    caseKeyword: string,
    caseExpr: string,
    returnKeyword: string,
    returnExpr: string,
    ctx: FormatterContext,
): string {
    ctx.indent();
    const result = `${ctx.currentIndent}${spaced(caseKeyword, caseExpr, returnKeyword, returnExpr)}`;
    ctx.dedent();
    return result;
}

// ─── Declaration Formatting ───────────────────────────────────────────────────

/**
 * Formats a function declaration.
 *
 * ```
 * declare function local:foo($x as integer, $y) as integer {
 *   $x + $y
 * };
 * ```
 */
export function formatFunctionDecl(
    annotations: string,
    name: string,
    params: string,
    returnType: string | null,
    body: string | null,
    isExternal: boolean,
    ctx: FormatterContext,
): string {
    const signature = spaced("declare", annotations, "function", name + params);

    const withReturn = returnType !== null ? spaced(signature, "as", returnType) : signature;

    if (isExternal) {
        return `${withReturn} external;`;
    }

    if (body === null) {
        return `${withReturn};`;
    }

    const formattedBody = formatBlock(body, ctx);
    return `${withReturn} ${formattedBody};`;
}

/**
 * Formats a variable declaration.
 *
 * ```
 * declare variable $x as integer := 42;
 * declare %private variable $y external;
 * ```
 */
export function formatVarDecl(
    annotations: string,
    name: string,
    typeAnnotation: string | null,
    value: string | null,
    isExternal: boolean,
    defaultValue: string | null,
): string {
    let decl = spaced("declare", annotations, "variable", name);

    if (typeAnnotation !== null) {
        decl = spaced(decl, "as", typeAnnotation);
    }

    if (isExternal) {
        if (defaultValue !== null) {
            return `${decl} external := ${defaultValue};`;
        }
        return `${decl} external;`;
    }

    if (value !== null) {
        return `${decl} := ${value};`;
    }

    return `${decl};`;
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

// ─── Binary Expression Formatting ─────────────────────────────────────────────

/**
 * Formats a binary expression with proper spacing around the operator.
 *
 * Examples:
 *   formatBinaryExpr("$x", "+", "$y") => "$x + $y"
 *   formatBinaryExpr("$a", "and", "$b") => "$a and $b"
 */
export function formatBinaryExpr(left: string, operator: string, right: string): string {
    return `${left} ${operator} ${right}`;
}

/**
 * Formats a chain of binary expressions with the same precedence.
 *
 * Examples:
 *   formatBinaryChain(["$a", "$b", "$c"], ["+", "+"]) => "$a + $b + $c"
 */
export function formatBinaryChain(operands: string[], operators: string[]): string {
    if (operands.length === 0) {
        return "";
    }
    let result = operands[0]!;
    for (let i = 0; i < operators.length; i++) {
        result += ` ${operators[i]!} ${operands[i + 1] ?? ""}`;
    }
    return result;
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

// ─── Comment Integration ──────────────────────────────────────────────────────

/**
 * Checks for comments between two tokens and returns a formatted comment string.
 * Returns empty string if no comments are found.
 */
export function getInterTokenComments(
    fromTokenIndex: number,
    toTokenIndex: number,
    ctx: FormatterContext,
): string {
    const comments = ctx.getCommentsBetween(fromTokenIndex, toTokenIndex);
    if (comments.length === 0) {
        return "";
    }

    const parts: string[] = [];
    for (const comment of comments) {
        const text = comment.text?.trim() ?? "";
        if (text !== "") {
            if (isInlineComment(comment, ctx)) {
                parts.push(` ${text}`);
            } else {
                parts.push(`\n${ctx.currentIndent}${text}`);
            }
        }
    }
    return parts.join("");
}

// ─── Terminal Node Helpers ────────────────────────────────────────────────────

/**
 * Safely extracts text from a terminal node.
 */
export function terminalText(node: TerminalNode | null | undefined): string {
    if (node === null || node === undefined) {
        return "";
    }
    return node.getText();
}

/**
 * Visits all children of a node using a visit function and joins results with spaces.
 * Filters out empty strings. This is the default formatting behavior for unhandled rules.
 */
export function visitAndJoin(
    node: ParserRuleContext,
    visit: (child: ParserRuleContext) => string,
): string {
    const parts: string[] = [];
    const count = node.getChildCount();
    for (let i = 0; i < count; i++) {
        const child = node.getChild(i);
        if (child === null) {
            continue;
        }
        if (child instanceof ParserRuleContext) {
            const result = visit(child);
            if (result !== "") {
                parts.push(result);
            }
        } else {
            // Terminal node
            const text = child.getText().trim();
            if (text !== "") {
                parts.push(text);
            }
        }
    }
    return smartJoin(parts);
}

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

    // No space before comma, semicolon, colon (for axis steps like child::)
    if (firstChar === "," || firstChar === ";") {
        return false;
    }

    // No space after $ (variable prefix)
    if (lastChar === "$") {
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

    // No space before postfix / lookup / predicate operations (., [, etc.)
    if (
        right.startsWith(".") ||
        right.startsWith("[") ||
        left === "." ||
        left === ".." ||
        right === "." ||
        right === ".."
    ) {
        return false;
    }

    // No space before # (named function ref arity)
    if (firstChar === "#") {
        return false;
    }

    // No space after # (named function ref arity)
    if (lastChar === "#") {
        return false;
    }

    return true;
}

// ─── Prolog Declaration Separation ────────────────────────────────────────────

/**
 * Determines if two consecutive prolog declarations should have a blank line between them.
 * Related declarations (e.g., consecutive imports) are grouped together.
 */
export function shouldSeparateDeclarations(prev: string, current: string): boolean {
    const prevType = getDeclarationType(prev);
    const currentType = getDeclarationType(current);

    // Same type of declaration: no blank line (group them)
    if (prevType === currentType) {
        return false;
    }

    // Different types: insert blank line
    return true;
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

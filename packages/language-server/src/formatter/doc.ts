/**
 * Document IR (Intermediate Representation) for Wadler/Prettier-style pretty printing.
 *
 * Instead of visitor methods producing formatted strings directly, they construct
 * a tree of layout instructions (`Doc`). The printer layout engine then evaluates
 * `Doc` trees against the target line width to decide where line breaks should occur.
 */

export type Doc = TextDoc | VerbatimDoc | ConcatDoc | GroupDoc | IndentDoc | LineDoc;

interface TextDoc {
    readonly kind: "text";
    /** A text fragment never contains a newline; use `line` or `hardline` instead. */
    readonly text: string;
}

interface VerbatimDoc {
    readonly kind: "verbatim";
    /** Exact source text. Newlines and their following indentation are preserved. */
    readonly text: string;
}

interface ConcatDoc {
    readonly kind: "concat";
    readonly docs: readonly Doc[];
}

/**
 * How a group decides between flat, with its lines as spaces, and broken, with its lines as line breaks:
 * - `fit`: flat if it fits on the line;
 * - `break`: always broken, as are the groups around it, as if it contained a hard line;
 * - `flat`: always flat, with the groups inside it, however long the line.
 */
export type GroupLayout = "fit" | "break" | "flat";

interface GroupDoc {
    readonly kind: "group";
    readonly doc: Doc;
    readonly layout: GroupLayout;
}

interface IndentDoc {
    readonly kind: "indent";
    readonly doc: Doc;
}

interface LineDoc {
    readonly kind: "line";
    /** If true, this newline is compulsory and will break containing groups */
    readonly hard: boolean;
    /** If true, prints nothing when flat (instead of space) */
    readonly soft: boolean;
    /** If true, this hard newline prints nothing when the line so far holds only indentation. */
    readonly unlessAtLineStart?: boolean;
    /** With `unlessAtLineStart`, the new line also follows a blank line, unless there already is one. */
    readonly afterBlankLine?: boolean;
}

// ─── Constants & Constructors ──────────────────────────────────────────────────

export const NIL: TextDoc = { kind: "text", text: "" };
/** A single space character. Use instead of `text(" ")` for clarity. */
export const space: TextDoc = { kind: "text", text: " " };
export const line: LineDoc = { kind: "line", hard: false, soft: false };
export const softline: LineDoc = { kind: "line", hard: false, soft: true };
export const hardline: LineDoc = { kind: "line", hard: true, soft: false };
/** Starts a new line unless the current one holds only indentation, such as before a comment on its own line. */
export const lineStart: LineDoc = {
    kind: "line",
    hard: true,
    soft: false,
    unlessAtLineStart: true,
};
/** Like `lineStart`, and also leaves one blank line before the new line, such as one the source has there. */
export const blankLineStart: LineDoc = { ...lineStart, afterBlankLine: true };

/** Whether a document prints nothing, such as `NIL`. */
export function isEmptyDoc(doc: Doc): boolean {
    return doc.kind === "text" && doc.text === "";
}

export function text(str: string): Doc {
    if (str === "") {
        return NIL;
    }
    // Preserve the document-algebra invariant that only line documents introduce
    // newlines. This is relevant for multiline comments and protects column tracking.
    if (str.includes("\n") || str.includes("\r")) {
        const lines = str.split(/\r\n|\r|\n/);
        const docs: Doc[] = [];
        for (let i = 0; i < lines.length; i++) {
            if (i > 0) {
                docs.push(hardline);
            }
            if (lines[i] !== "") {
                docs.push({ kind: "text", text: lines[i]! });
            }
        }
        return concat(docs);
    }
    return { kind: "text", text: str };
}

/** Creates semantic source text that the printer must reproduce byte-for-byte. */
export function verbatim(str: string): Doc {
    return str === "" ? NIL : { kind: "verbatim", text: str };
}

export function concat(docs: readonly Doc[]): Doc {
    const flattened: Doc[] = [];
    for (const d of docs) {
        if (isEmptyDoc(d)) {
            continue;
        }
        if (d.kind === "concat") {
            flattened.push(...d.docs);
        } else {
            flattened.push(d);
        }
    }
    if (flattened.length === 0) {
        return NIL;
    }
    if (flattened.length === 1) {
        return flattened[0]!;
    }
    return { kind: "concat", docs: flattened };
}

export function group(doc: Doc, { shouldBreak = false }: { shouldBreak?: boolean } = {}): Doc {
    const layout = shouldBreak ? "break" : "fit";
    if (doc.kind === "group") {
        return shouldBreak ? { ...doc, layout } : doc;
    }
    return { kind: "group", doc, layout };
}

/** Keeps a document on one line, such as an expression interpolated in a string, which no line break shortens. */
export function flat(doc: Doc): Doc {
    return { kind: "group", doc, layout: "flat" };
}

export function indent(doc: Doc): Doc {
    if (isEmptyDoc(doc)) {
        return NIL;
    }
    return { kind: "indent", doc };
}

/**
 * Joins an array of Doc nodes with a separator.
 */
export function join(sep: Doc, docs: readonly Doc[]): Doc {
    const parts: Doc[] = [];
    for (let i = 0; i < docs.length; i++) {
        if (i > 0) {
            parts.push(sep);
        }
        parts.push(docs[i]!);
    }
    return concat(parts);
}

/**
 * Convenience helper to join items with spaced delimiter (e.g. `$a`, `$b`).
 */
export function spacedDocs(...parts: (Doc | null | undefined)[]): Doc {
    const valid = parts.filter((p): p is Doc => p !== null && p !== undefined && !isEmptyDoc(p));
    return join(text(" "), valid);
}

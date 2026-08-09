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

interface GroupDoc {
    readonly kind: "group";
    readonly doc: Doc;
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
}

// ─── Constants & Constructors ──────────────────────────────────────────────────

export const NIL: TextDoc = { kind: "text", text: "" };
/** A single space character. Use instead of `text(" ")` for clarity. */
export const space: TextDoc = { kind: "text", text: " " };
export const line: LineDoc = { kind: "line", hard: false, soft: false };
export const softline: LineDoc = { kind: "line", hard: false, soft: true };
export const hardline: LineDoc = { kind: "line", hard: true, soft: false };

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
        if (d.kind === "text" && d.text === "") {
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

export function group(doc: Doc): Doc {
    if (doc.kind === "group") {
        return doc;
    }
    return { kind: "group", doc };
}

export function indent(doc: Doc): Doc {
    if (doc.kind === "text" && doc.text === "") {
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
    const valid = parts.filter(
        (p): p is Doc => p !== null && p !== undefined && !(p.kind === "text" && p.text === ""),
    );
    return join(text(" "), valid);
}

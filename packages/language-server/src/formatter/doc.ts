/**
 * Document IR (Intermediate Representation) for Wadler/Prettier-style pretty printing.
 *
 * Instead of visitor methods producing formatted strings directly, they construct
 * a tree of layout instructions (`Doc`). The printer layout engine then evaluates
 * `Doc` trees against the target line width to decide where line breaks should occur.
 */

export type Doc = TextDoc | ConcatDoc | GroupDoc | IndentDoc | LineDoc | IfBreakDoc;

export interface TextDoc {
    readonly kind: "text";
    readonly text: string;
}

export interface ConcatDoc {
    readonly kind: "concat";
    readonly docs: readonly Doc[];
}

export interface GroupDoc {
    readonly kind: "group";
    readonly doc: Doc;
    readonly id?: symbol | undefined;
}

export interface IndentDoc {
    readonly kind: "indent";
    readonly doc: Doc;
}

export interface LineDoc {
    readonly kind: "line";
    /** If true, this newline is compulsory and will break containing groups */
    readonly hard: boolean;
    /** If true, prints nothing when flat (instead of space) */
    readonly soft: boolean;
}

export interface IfBreakDoc {
    readonly kind: "ifBreak";
    readonly breakDoc: Doc;
    readonly flatDoc: Doc;
    readonly groupId?: symbol | undefined;
}

// ─── Constants & Constructors ──────────────────────────────────────────────────

export const NIL: TextDoc = { kind: "text", text: "" };
export const line: LineDoc = { kind: "line", hard: false, soft: false };
export const softline: LineDoc = { kind: "line", hard: false, soft: true };
export const hardline: LineDoc = { kind: "line", hard: true, soft: false };

export function text(str: string): Doc {
    if (str === "") {
        return NIL;
    }
    return { kind: "text", text: str };
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

export function group(doc: Doc, id?: symbol): Doc {
    if (doc.kind === "group") {
        return doc;
    }
    return { kind: "group", doc, id };
}

export function indent(doc: Doc): Doc {
    if (doc.kind === "text" && doc.text === "") {
        return NIL;
    }
    return { kind: "indent", doc };
}

export function ifBreak(breakDoc: Doc, flatDoc: Doc = NIL, groupId?: symbol): Doc {
    return { kind: "ifBreak", breakDoc, flatDoc, groupId };
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

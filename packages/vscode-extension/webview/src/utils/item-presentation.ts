import type { RunQueryItem } from "@/types.js";

import type { SourceLanguage } from "./syntax-highlight.js";

const PREVIEW_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Keep at most maxLength UTF-16 code units without splitting a grapheme (such as
 * an emoji or combining character). Append an extra ellipsis when text is omitted.
 */
export function truncatePreview(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    let end = 0;
    for (const { segment, index } of PREVIEW_SEGMENTER.segment(text)) {
        if (index + segment.length > maxLength) break;
        end = index + segment.length;
    }
    return `${text.slice(0, end)}…`;
}

/** Plain text summary for table sizing uses the same fragments as the visible preview. */
export function itemPreview(item: RunQueryItem): string {
    return itemPreviewParts(item)
        .map((part) => part.content)
        .join("");
}

/**
 * Identify values with structured children or useful expanded source. The UI
 * also allows expansion when a summary is truncated or visually clipped.
 */
export function isExpandable(item: RunQueryItem): boolean {
    if (item.kind === "object") return item.fields.length > 0;
    if (item.kind === "map") return item.entries.length > 0;
    if (item.kind === "array") return item.members.length > 0;
    if (item.kind === "node" || item.kind === "function") return true;
    return item.serialized.includes("\n");
}

/** Display fragment; language selects XML for nodes and XQuery for other leaf source. */
export interface PreviewPart {
    content: string;
    tone?: "null" | "value" | "key" | "punctuation";
    language?: SourceLanguage;
    title?: string;
    truncated?: boolean;
}

export const SUMMARY_CHARACTER_LIMIT = 1000;

/**
 * Build a collapsed summary from typed children, capped at SUMMARY_CHARACTER_LIMIT
 * code units plus an ellipsis. Truncation happens before syntax highlighting;
 * copying and expanded source continue to use the original serialization.
 */
export function itemPreviewParts(item: RunQueryItem): PreviewPart[] {
    const parts = typedPreview(item, 0, SUMMARY_CHARACTER_LIMIT);
    const bounded: PreviewPart[] = [];
    let remaining = SUMMARY_CHARACTER_LIMIT;
    for (const part of parts) {
        if (part.content.length > remaining) {
            const { content, ...attributes } = part;
            bounded.push(...limitedPart(content, remaining, attributes));
            return bounded;
        }
        bounded.push(part);
        remaining -= part.content.length;
    }
    return bounded;
}

/** Keep omitted-text markers separate so they are never passed to a syntax grammar. */
function limitedPart(
    content: string,
    limit: number,
    attributes: Omit<PreviewPart, "content">,
): PreviewPart[] {
    if (content.length <= limit) return [{ content, ...attributes }];
    const preview = truncatePreview(content, limit);
    return [
        { content: preview.slice(0, -1), ...attributes },
        { content: "…", tone: "punctuation", truncated: true },
    ];
}

/** Structural separators use the editor foreground rather than a value's type color. */
const punctuation = (content: string): PreviewPart => ({ content, tone: "punctuation" });
/** Mark omitted entries or deeper children so the UI can offer expansion. */
const omitted = (): PreviewPart => ({ content: "…", tone: "punctuation", truncated: true });

/**
 * Preview a field, map value, or array member sequence: () for empty, an unwrapped
 * singleton, or (a, b, …) for multiple items. Show at most two items with 40-code-unit
 * leaf limits. Sequence grouping does not increase the container nesting depth.
 */
function typedSequence(sequence: RunQueryItem[], depth: number): PreviewPart[] {
    if (sequence.length === 0) return [{ content: "()", tone: "null", title: "Empty sequence" }];
    const parts: PreviewPart[] = sequence.length === 1 ? [] : [punctuation("(")];
    for (const [index, value] of sequence.slice(0, 2).entries()) {
        if (index > 0) parts.push(punctuation(", "));
        parts.push(...typedPreview(value, depth, 40));
    }
    if (sequence.length > 2) parts.push(punctuation(", "), omitted());
    if (sequence.length !== 1) parts.push(punctuation(")"));
    return parts;
}

/**
 * Recursively preview one item, showing at most three container entries and
 * replacing nonempty containers at depth 2 with an omission marker. limit bounds
 * leaf text; nested leaves collapse line breaks after truncation. Container text
 * receives its overall budget in itemPreviewParts.
 */
function typedPreview(item: RunQueryItem, depth: number, limit: number): PreviewPart[] {
    if (item.kind !== "object" && item.kind !== "map" && item.kind !== "array") {
        const attributes: Omit<PreviewPart, "content"> = {
            tone: item.kind === "null" ? "null" : "value",
            language: item.kind === "node" ? "xml" : "xquery",
        };
        // Bound work before collapsing multiline text in nested summaries.
        const parts = limitedPart(item.serialized, limit, attributes);
        if (depth > 0) {
            for (const part of parts) part.content = part.content.replace(/\s*\n\s*/g, " ");
        }
        return parts;
    }

    const parts: PreviewPart[] = item.kind === "map" ? [{ content: "map", tone: "key" }] : [];
    const open = item.kind === "array" ? "[" : "{";
    const close = item.kind === "array" ? "]" : "}";
    parts.push(punctuation(open));

    const count =
        item.kind === "array"
            ? item.members.length
            : item.kind === "object"
              ? item.fields.length
              : item.entries.length;
    if (count > 0 && depth >= 2) parts.push(omitted());
    else if (item.kind === "array") {
        for (const [index, sequence] of item.members.slice(0, 3).entries()) {
            if (index > 0) parts.push(punctuation(", "));
            parts.push(...typedSequence(sequence, depth + 1));
        }
    } else if (item.kind === "object") {
        for (const [index, field] of item.fields.slice(0, 3).entries()) {
            if (index > 0) parts.push(punctuation(", "));
            const name = truncatePreview(field.name, 40);
            parts.push(
                ...limitedPart(JSON.stringify(name), 40, {
                    tone: "key",
                    title: truncatePreview(field.name, SUMMARY_CHARACTER_LIMIT),
                    truncated: name !== field.name,
                }),
            );
            parts.push(punctuation(": "), ...typedSequence(field.value, depth + 1));
        }
    } else {
        /// Map
        for (const [index, entry] of item.entries.slice(0, 3).entries()) {
            if (index > 0) parts.push(punctuation(", "));
            parts.push(...typedPreview(entry.key, depth + 1, 40));
            parts.push(punctuation(": "), ...typedSequence(entry.value, depth + 1));
        }
    }

    if (count > 3 && depth < 2) parts.push(punctuation(", "), omitted());
    parts.push(punctuation(close));

    return parts;
}

import type { RunQueryItem } from "@/types.js";

const STRING_TYPES = new Set([
    "string",
    "normalizedString",
    "token",
    "language",
    "NMTOKEN",
    "Name",
    "NCName",
    "ID",
    "IDREF",
    "ENTITY",
    "untypedAtomic",
    "anyURI",
]);
const NUMERIC_TYPES = new Set([
    "decimal",
    "double",
    "float",
    "integer",
    "int",
    "long",
    "short",
    "byte",
    "nonPositiveInteger",
    "negativeInteger",
    "nonNegativeInteger",
    "positiveInteger",
    "unsignedLong",
    "unsignedInt",
    "unsignedShort",
    "unsignedByte",
]);

const PREVIEW_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Keep character limits without splitting emoji or combining characters. */
export function truncatePreview(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    let end = 0;
    for (const { segment, index } of PREVIEW_SEGMENTER.segment(text)) {
        if (index + segment.length > maxLength) break;
        end = index + segment.length;
    }
    return `${text.slice(0, end)}…`;
}

export function itemTone(item: RunQueryItem): "number" | "string" | "boolean" | "null" | "value" {
    if (item.kind === "null") return "null";
    if (item.kind !== "atomic") return "value";
    const prefix = "Q{http://www.w3.org/2001/XMLSchema}";
    const name = item.type.qname?.startsWith(prefix) ? item.type.qname.slice(prefix.length) : "";
    if (NUMERIC_TYPES.has(name)) return "number";
    if (name === "boolean") return "boolean";
    if (STRING_TYPES.has(name)) return "string";
    return "value";
}

export function itemPreview(item: RunQueryItem, compact = true): string {
    if (compact && (item.kind === "object" || item.kind === "map" || item.kind === "array")) {
        return containerPreview(item, 0);
    }
    return item.serialized;
}

type ContainerItem = Extract<RunQueryItem, { kind: "object" | "map" | "array" }>;

function containerPreview(item: ContainerItem, depth: number): string {
    if (item.kind === "array") {
        const members = item.members;
        if (members.length === 0) return "[]";
        if (depth >= 2) return "[…]";
        const previews = members
            .slice(0, 3)
            .map((sequence) => sequencePreview(sequence, depth + 1));
        if (members.length > 3) previews.push("…");
        return `[${previews.join(", ")}]`;
    }
    const prefix = item.kind === "map" ? "map" : "";
    const entries = item.kind === "object" ? item.fields : item.entries;
    if (entries.length === 0) return `${prefix}{}`;
    if (depth >= 2) return `${prefix}{…}`;
    const previews =
        item.kind === "object"
            ? item.fields
                  .slice(0, 3)
                  .map(
                      (field) =>
                          `${truncatePreview(JSON.stringify(field.name), 40)}: ${sequencePreview(field.value, depth + 1)}`,
                  )
            : item.entries
                  .slice(0, 3)
                  .map(
                      (entry) =>
                          `${shortValue(entry.key, depth + 1)}: ${sequencePreview(entry.value, depth + 1)}`,
                  );
    if (entries.length > 3) previews.push("…");
    return `${prefix}{${previews.join(", ")}}`;
}

function sequencePreview(sequence: RunQueryItem[], depth: number): string {
    if (sequence.length === 0) return "()";
    const values = sequence.slice(0, 2).map((value) => shortValue(value, depth));
    if (sequence.length > 2) values.push("…");
    return sequence.length === 1 ? values[0]! : `(${values.join(", ")})`;
}

function shortValue(value: RunQueryItem, depth: number): string {
    if (value.kind === "array" || value.kind === "object" || value.kind === "map") {
        return containerPreview(value, depth);
    }
    const text = itemPreview(value).replace(/\s*\n\s*/g, " ");
    return truncatePreview(text, 40);
}

export function isExpandable(item: RunQueryItem): boolean {
    if (item.kind === "object") return item.fields.length > 0;
    if (item.kind === "map") return item.entries.length > 0;
    if (item.kind === "array") return item.members.length > 0;
    if (item.kind === "node" || item.kind === "function") return true;
    return item.serialized.includes("\n");
}

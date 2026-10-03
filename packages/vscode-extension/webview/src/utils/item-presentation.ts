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

export function itemTone(item: RunQueryItem): "number" | "string" | "boolean" | "null" | "value" {
    if (item.kind === "null") return "null";
    if (item.kind !== "atomic") return "value";
    const prefix = "Q{http://www.w3.org/2001/XMLSchema}";
    const name = item.typeName
        ? item.typeName.startsWith(prefix)
            ? item.typeName.slice(prefix.length)
            : ""
        : item.type.startsWith("xs:")
          ? item.type.slice(3)
          : "";
    if (NUMERIC_TYPES.has(name)) return "number";
    if (name === "boolean") return "boolean";
    if (STRING_TYPES.has(name)) return "string";
    return "value";
}

export function itemPreview(item: RunQueryItem, compact = true): string {
    if (item.kind === "object" || item.kind === "map" || item.kind === "array") {
        return containerPreview(item, 0, compact);
    }
    if (item.kind === "null") return "null";
    if (item.kind === "function" && item.function) {
        return `${item.function.name}#${item.function.arity}`;
    }
    if (
        item.kind === "atomic" &&
        (itemTone(item) === "number" ||
            itemTone(item) === "boolean" ||
            item.typeName?.startsWith("Q{http://www.w3.org/2001/XMLSchema}")) &&
        itemTone(item) !== "string" &&
        item.lexicalValue !== undefined
    ) {
        return item.lexicalValue;
    }
    return item.serialized ?? `[${item.serializationError ?? "Serialization unavailable"}]`;
}

function containerPreview(item: RunQueryItem, depth: number, compact: boolean): string {
    if (item.kind === "array") {
        const members = item.members ?? [];
        if (members.length === 0) return "[]";
        if (compact && depth >= 2) return "[…]";
        const previews = members
            .slice(0, compact ? 3 : undefined)
            .map((sequence) => sequencePreview(sequence, depth + 1, compact));
        if (compact && members.length > 3) previews.push("…");
        return `[${previews.join(", ")}]`;
    }
    const prefix = item.kind === "map" ? "map" : "";
    const entries = item.entries ?? [];
    if (entries.length === 0) return `${prefix}{}`;
    if (compact && depth >= 2) return `${prefix}{…}`;
    const previews = entries
        .slice(0, compact ? 3 : undefined)
        .map(
            (entry) =>
                `${shortValue(entry.key, depth + 1, compact)}: ${sequencePreview(entry.value, depth + 1, compact)}`,
        );
    if (compact && entries.length > 3) previews.push("…");
    return `${prefix}{${previews.join(", ")}}`;
}

function sequencePreview(sequence: RunQueryItem[], depth: number, compact: boolean): string {
    if (sequence.length === 0) return "()";
    const values = sequence
        .slice(0, compact ? 2 : undefined)
        .map((value) => shortValue(value, depth, compact));
    if (compact && sequence.length > 2) values.push("…");
    return sequence.length === 1 ? values[0]! : `(${values.join(", ")})`;
}

function shortValue(value: RunQueryItem, depth: number, compact: boolean): string {
    if (["array", "object", "map"].includes(value.kind))
        return containerPreview(value, depth, compact);
    if (itemTone(value) === "string" && value.lexicalValue !== undefined) {
        const text = value.lexicalValue;
        return JSON.stringify(compact && text.length > 32 ? `${text.slice(0, 32)}…` : text);
    }
    const text = itemPreview(value, compact).replace(/\s*\n\s*/g, " ");
    return compact && text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

export function isExpandable(item: RunQueryItem, previewLength = 120): boolean {
    if (item.kind === "object" || item.kind === "map") return Boolean(item.entries?.length);
    if (item.kind === "array") return Boolean(item.members?.length);
    if (item.kind === "node" || item.kind === "function") return true;
    const value = itemPreview(item);
    return value.length > previewLength || value.includes("\n");
}

import type { RunQueryItem } from "@/types.js";

/** Use the engine's serialization directly: never reparse values as JavaScript numbers. */
export function formatRawOutput(items: readonly RunQueryItem[]): string {
    if (items.length === 0) return "()";
    return items.map((item) => item.serialized).join("\n");
}

export type ResultTableRow = Record<string, RunQueryItem[]>;

export interface ResultSelection {
    items: RunQueryItem[];
    rows: ResultTableRow[];
    columns: string[];
}

export function formatCell(items: RunQueryItem[] | undefined): string {
    if (items === undefined) return "—";
    if (items.length === 0) return "()";
    return items.length === 1
        ? items[0]!.serialized
        : `(${items.map((item) => item.serialized).join(", ")})`;
}

/**
 * Summarize the values of a table column as a JSONiq sequence type, e.g. `xs:integer?`.
 * Missing fields count as empty sequences; differing item types widen to `item()`.
 */
export function summarizeSequenceType(cells: readonly (RunQueryItem[] | undefined)[]): string {
    const itemTypes = new Set<string>();
    let minLength = Infinity;
    let maxLength = 0;
    for (const cell of cells) {
        const items = cell ?? [];
        for (const item of items) itemTypes.add(item.type.displayName);
        minLength = Math.min(minLength, items.length);
        maxLength = Math.max(maxLength, items.length);
    }
    if (itemTypes.size === 0) return "empty-sequence()";

    const itemType = itemTypes.size === 1 ? [...itemTypes][0]! : "item()";
    if (maxLength > 1) return itemType + (minLength === 0 ? "*" : "+");
    return itemType + (minLength === 0 ? "?" : "");
}

/** Only JSONiq object sequences are projected into fields; mixed items retain their full value. */
export function projectTableRows(items: readonly RunQueryItem[]) {
    const objects = items.length > 0 && items.every((item) => item.kind === "object");
    const rows: ResultTableRow[] = items.map((item) => {
        if (!objects || item.kind !== "object") return { value: [item] };
        const row: ResultTableRow = Object.create(null);
        for (const field of item.fields) {
            row[field.name] = field.value;
        }
        return row;
    });
    const columns = objects
        ? Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
        : ["value"];
    return { objects, rows, columns };
}

/** Source indexes stay stable through sorting/filtering; include every matching page. */
export function selectResultItems(
    items: readonly RunQueryItem[],
    indexes: readonly number[],
): RunQueryItem[] {
    return indexes.map((index) => {
        const item = items[index];
        if (!item) throw new RangeError(`Unknown result index: ${index}`);
        return item;
    });
}

import type { RunQueryItem, RunQueryItemType } from "@/types.js";

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

/** The type label of a projected field, e.g. `xs:string?` when some objects lack the field. */
export function fieldTypeLabel(
    itemType: RunQueryItemType | null | undefined,
    field: string,
): string | undefined {
    if (itemType?.kind !== "object") return undefined;
    const { type, required } = itemType.fields[field] ?? {};
    return type?.displayName && type.displayName + (required ? "" : "?");
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

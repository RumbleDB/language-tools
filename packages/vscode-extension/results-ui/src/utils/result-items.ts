import type { RunQueryItem } from "../types.js";

/** Use the engine's serialization directly: never reparse values as JavaScript numbers. */
export function formatRawOutput(items: readonly RunQueryItem[]): string {
    if (items.length === 0) return "()";
    return items.map(formatItem).join("\n");
}

export function formatItem(item: RunQueryItem): string {
    return (
        item.serialized ??
        `[${item.type}: ${item.serializationError ?? "Serialization unavailable"}]`
    );
}

export type ResultTableRow = Record<string, RunQueryItem[]>;

export function formatCell(items: RunQueryItem[] | undefined): string {
    if (items === undefined) return "—";
    if (items.length === 0) return "()";
    return items.length === 1 ? formatItem(items[0]!) : `(${items.map(formatItem).join(", ")})`;
}

/** Only JSONiq object sequences are projected into fields; mixed items retain their full value. */
export function projectTableRows(items: readonly RunQueryItem[]) {
    const objects = items.length > 0 && items.every((item) => item.kind === "object");
    const rows: ResultTableRow[] = items.map((item) => {
        if (!objects) return { value: [item] };
        const row: ResultTableRow = Object.create(null);
        for (const entry of item.entries ?? []) {
            row[entry.key.lexicalValue!] = entry.value;
        }
        return row;
    });
    return { objects, rows };
}

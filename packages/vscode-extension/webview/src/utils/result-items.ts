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

export interface ResultSelection {
    items: RunQueryItem[];
    rows: ResultTableRow[];
    columns: string[];
}

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

/** Export must not silently substitute an error message for an unserializable value. */
export function serializeResultItems(items: readonly RunQueryItem[]): string {
    if (items.some((item) => item.serialized === null)) {
        throw new Error(
            "Some results cannot be serialized. Inspect their error details before exporting.",
        );
    }
    return formatRawOutput(items);
}

export function formatCsv(rows: readonly ResultTableRow[], columns: readonly string[]): string {
    const quote = (text: string) => `"${text.replace(/"/g, '""')}"`;
    const safeText = (text: string) => (/^(?:[\t\r\n]|\s*[=+\-@])/.test(text) ? `'${text}` : text);
    const lines = [columns.map((column) => quote(safeText(column))).join(",")];
    for (const row of rows) {
        lines.push(
            columns
                .map((column) => {
                    const sequence = row[column];
                    if (sequence === undefined) return '""';
                    let text = formatCell(sequence);
                    if (sequence.length === 1) {
                        const item = sequence[0]!;
                        if (item.serialized === null)
                            throw new Error("Some cells cannot be serialized.");
                        text = item.lexicalValue ?? item.serialized;
                        // Keep spreadsheet programs from executing formula-like text values.
                        // Numeric values retain their lexical representation, including negative numbers.
                        const typeName = item.typeName ?? item.type;
                        const numeric =
                            /^(?:xs:|Q\{http:\/\/www\.w3\.org\/2001\/XMLSchema\})(?:decimal|double|float|integer|int|long|short|byte|nonPositiveInteger|negativeInteger|nonNegativeInteger|positiveInteger|unsignedLong|unsignedInt|unsignedShort|unsignedByte)$/.test(
                                typeName,
                            );
                        if (!numeric && /^(?:[\t\r\n]|\s*[=+\-@])/.test(text)) text = `'${text}`;
                    } else if (sequence.some((item) => item.serialized === null)) {
                        throw new Error("Some cells cannot be serialized.");
                    }
                    return quote(text);
                })
                .join(","),
        );
    }
    return `${lines.join("\r\n")}\r\n`;
}

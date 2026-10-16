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

/** The lexical value of a cell holding one number. */
export function numericCellValue(items: RunQueryItem[] | undefined): string | undefined {
    const item = items?.length === 1 ? items[0]! : undefined;
    return item?.kind === "atomic" ? item.number : undefined;
}

/** A finite number as sign × 0.digits × 10^exponent, with no leading or trailing zero digits. */
function decomposeNumber(lexical: string) {
    const [, sign = "", whole = "", fraction = "", exponent = "0"] =
        /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(lexical) ?? [];
    const allDigits = whole + fraction;
    const lead = allDigits.search(/[1-9]/);
    if (lead < 0) return { sign: 0, digits: "", exponent: 0 };
    return {
        sign: sign === "-" ? -1 : 1,
        digits: allDigits.slice(lead).replace(/0+$/, ""),
        exponent: whole.length - lead + Number(exponent),
    };
}

/**
 * Orders numeric lexical forms exactly, without reparsing them as JavaScript numbers. NaN sorts
 * first, as in an `order by` with `empty least`, followed by -INF, finite values, and INF.
 */
export function compareNumbers(a: string, b: string): number {
    const rank = (value: string) =>
        value === "NaN" ? 0 : value === "-INF" ? 1 : value === "INF" ? 3 : 2;
    if (rank(a) !== rank(b) || rank(a) !== 2) return rank(a) - rank(b);
    const x = decomposeNumber(a);
    const y = decomposeNumber(b);
    if (x.sign !== y.sign || x.sign === 0) return x.sign - y.sign;
    // Equal exponents compare digit strings lexicographically, as neither has trailing zeros.
    const magnitude =
        x.exponent - y.exponent || (x.digits < y.digits ? -1 : x.digits > y.digits ? 1 : 0);
    return x.sign * magnitude;
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

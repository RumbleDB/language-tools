export type ViewFormat = "sequence" | "json";
export type IndentMode = "pretty" | "compact";

/**
 * Formats the backend query output into the chosen representation:
 * - "sequence": Individual JSONiq sequence items (NDJSON / JSON Lines)
 * - "json": The raw JSON array wire envelope
 */
export function formatRawOutput(rawOutput: string, format: ViewFormat, indent: IndentMode): string {
    const trimmed = rawOutput.trim();
    if (!trimmed) return "";

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return trimmed;
    }

    if (format === "sequence") {
        if (!Array.isArray(parsed)) {
            return indent === "pretty" ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
        }

        if (indent === "pretty") {
            return parsed
                .map((item) =>
                    typeof item === "object" && item !== null
                        ? JSON.stringify(item, null, 2)
                        : JSON.stringify(item),
                )
                .join("\n");
        } else {
            return parsed.map((item) => JSON.stringify(item)).join("\n");
        }
    } else {
        return indent === "pretty" ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
    }
}

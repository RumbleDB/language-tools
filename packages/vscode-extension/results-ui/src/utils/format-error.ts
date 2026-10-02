import type { ExecutionResultData } from "../types.js";

/**
 * Formats a RunQueryError or execution error into human-readable text for copying or display.
 */
export function formatError(error: ExecutionResultData["error"], fileUri?: string): string {
    if (!error) return "";
    const lines: string[] = [];
    if (error.code) {
        lines.push(`Error Code: [${error.code}]`);
    }
    lines.push(`Message: ${error.message}`);
    const location = error.location || fileUri;
    if (location) {
        lines.push(`File: ${location}`);
    }
    if (error.range) {
        const startLine = error.range.start.line + 1;
        const startCol = error.range.start.character + 1;
        const endLine = error.range.end.line + 1;
        const endCol = error.range.end.character + 1;
        lines.push(`Position: Line ${startLine}, Column ${startCol} (to ${endLine}:${endCol})`);
    }
    return lines.join("\n");
}

/**
 * Configuration options for the JSONiq/XQuery formatter.
 */
export interface FormatterOptions {
    /** Number of spaces per indentation level. Default: 4 */
    readonly indentSize: number;
    /** Maximum line width before attempting to break. Default: 100 */
    readonly maxLineWidth: number;
    /** Use tabs instead of spaces for indentation. Default: false */
    readonly useTabs: boolean;
    /** Insert a blank line between unrelated top-level declarations. Default: true */
    readonly blankLineBetweenDeclarations: boolean;
    /** Maximum consecutive blank lines allowed. Default: 1 */
    readonly maxConsecutiveBlankLines: number;
    /** Ensure the file ends with exactly one newline. Default: true */
    readonly insertFinalNewline: boolean;
}

export const DEFAULT_FORMATTER_OPTIONS: Readonly<FormatterOptions> = {
    indentSize: 4,
    maxLineWidth: 100,
    useTabs: false,
    blankLineBetweenDeclarations: true,
    maxConsecutiveBlankLines: 1,
    insertFinalNewline: true,
};

export function resolveFormatterOptions(
    overrides?: Partial<FormatterOptions>,
): Readonly<FormatterOptions> {
    if (overrides === undefined) {
        return DEFAULT_FORMATTER_OPTIONS;
    }
    return { ...DEFAULT_FORMATTER_OPTIONS, ...overrides };
}

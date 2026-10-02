interface Position {
    line: number;
    character: number;
}
interface Range {
    start: Position;
    end: Position;
}

/** Small excerpt of the executed query; LSP range ends are exclusive. */
export function errorSourceLines(text: string | undefined, range: Range | null) {
    if (text === undefined || !range) return [];
    const lines = text.split(/\r\n|\n|\r/);
    if (range.start.line < 0 || range.start.line >= lines.length) return [];
    const lastErrorLine =
        range.end.character === 0 && range.end.line > range.start.line
            ? range.end.line - 1
            : range.end.line;
    const first = Math.max(0, range.start.line - 3);
    const last = Math.min(lines.length - 1, lastErrorLine + 3, first + 14);
    return lines.slice(first, last + 1).map((content, offset) => {
        const line = first + offset;
        const highlighted = line >= range.start.line && line <= lastErrorLine;
        const start = highlighted && line === range.start.line ? range.start.character : 0;
        const end = highlighted && line === range.end.line ? range.end.character : content.length;
        return {
            number: line + 1,
            highlighted,
            before: highlighted ? content.slice(0, start) : content,
            selected: highlighted ? content.slice(start, end) : "",
            after: highlighted ? content.slice(end) : "",
        };
    });
}

import type { ParseResult } from "../parser/types/result.js";
import { JsoniqFormatterVisitor } from "./adapters/jsoniq.js";
import { XQueryFormatterVisitor } from "./adapters/xquery.js";
import { FormatterContext } from "./context.js";
import { NIL, Doc } from "./doc.js";
import { type FormatterOptions, resolveFormatterOptions } from "./options.js";
import { printDocToString } from "./printer.js";

/**
 * Formats a parsed document and returns the formatted text.
 *
 * Returns undefined if the document has syntax errors or its parser is unsupported.
 */
export function formatParsedDocument(
    parsed: ParseResult,
    parserId: string,
    options?: Partial<FormatterOptions>,
): string | undefined {
    if (parsed.diagnostics.length > 0) return undefined;

    const resolvedOptions = resolveFormatterOptions(options);
    const ctx = new FormatterContext(resolvedOptions, parsed.tokenStream);

    let docTree: Doc;
    if (parserId === "jsoniq") {
        const visitor = new JsoniqFormatterVisitor(ctx);
        docTree = visitor.visit(parsed.tree) ?? NIL;
    } else if (parserId === "xquery") {
        const visitor = new XQueryFormatterVisitor(ctx);
        docTree = visitor.visit(parsed.tree) ?? NIL;
    } else {
        return undefined;
    }

    let formatted = printDocToString(docTree, resolvedOptions);

    // Ensure final newline
    if (resolvedOptions.insertFinalNewline) {
        if (!formatted.endsWith("\n")) {
            formatted += "\n";
        }
        // Remove multiple trailing newlines
        formatted = formatted.replace(/\n{2,}$/, "\n");
    }

    return formatted;
}

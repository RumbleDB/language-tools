import type { TextEdit } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { parseDocument } from "../parser/index.js";
import { getParserAdapterForDocument } from "../parser/registry.js";
import { getDocumentText } from "../parser/utils.js";
import { JsoniqFormatterVisitor } from "./adapters/jsoniq.js";
import { XQueryFormatterVisitor } from "./adapters/xquery.js";
import { FormatterContext } from "./context.js";
import { NIL, Doc } from "./doc.js";
import { normalizeBlankLines } from "./helpers.js";
import { type FormatterOptions, resolveFormatterOptions } from "./options.js";
import { printDocToString } from "./printer.js";

/**
 * Formats an entire document and returns a single TextEdit replacing the full content.
 *
 * Returns an empty array if:
 * - The document has syntax errors (we refuse to format invalid documents)
 * - The document language is not supported
 * - The formatted output is identical to the input (no changes needed)
 */
export function formatDocument(
    document: TextDocument,
    options?: Partial<FormatterOptions>,
): TextEdit[] {
    const adapter = getParserAdapterForDocument(document);
    if (adapter === undefined) {
        return [];
    }

    const parsed = parseDocument(document);

    // Refuse to format documents with syntax errors
    if (parsed.diagnostics.length > 0) {
        return [];
    }

    const resolvedOptions = resolveFormatterOptions(options);
    const ctx = new FormatterContext(resolvedOptions, parsed.tokenStream);

    let docTree: Doc;
    if (adapter.id === "jsoniq") {
        const visitor = new JsoniqFormatterVisitor(ctx);
        docTree = visitor.visit(parsed.tree) ?? NIL;
    } else if (adapter.id === "xquery") {
        const visitor = new XQueryFormatterVisitor(ctx);
        docTree = visitor.visit(parsed.tree) ?? NIL;
    } else {
        return [];
    }

    let formatted = printDocToString(docTree, resolvedOptions);

    // Post-process: normalize blank lines and trailing whitespace
    formatted = normalizeBlankLines(formatted, resolvedOptions.maxConsecutiveBlankLines);

    // Ensure final newline
    if (resolvedOptions.insertFinalNewline) {
        if (!formatted.endsWith("\n")) {
            formatted += "\n";
        }
        // Remove multiple trailing newlines
        formatted = formatted.replace(/\n{2,}$/, "\n");
    }

    // If the formatted output is identical, return no edits
    const originalText = getDocumentText(document);
    if (formatted === originalText) {
        return [];
    }

    // Return a single TextEdit replacing the entire document
    const lastLine = document.lineCount - 1;
    const lastLineLength =
        document.getText().length - document.offsetAt({ line: lastLine, character: 0 });

    return [
        {
            range: {
                start: { line: 0, character: 0 },
                end: { line: lastLine, character: lastLineLength },
            },
            newText: formatted,
        },
    ];
}

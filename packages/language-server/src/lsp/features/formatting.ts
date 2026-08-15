import { formatParsedDocument } from "server/formatter/index.js";
import { getParserAdapterForDocument } from "server/parser/registry.js";
import { getDocumentText } from "server/parser/utils.js";

import type { FeatureRegistrationContext } from "./context.js";

export function registerFormatting({
    connection,
    documents,
    parser,
}: FeatureRegistrationContext): void {
    connection.onDocumentFormatting((params) => {
        const document = documents.get(params.textDocument.uri);
        if (document === undefined) return [];

        const adapter = getParserAdapterForDocument(document);
        if (adapter === undefined) return [];

        const formatted = formatParsedDocument(parser.parse(document), adapter.id);
        if (formatted === undefined || formatted === getDocumentText(document)) return [];

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
    });
}

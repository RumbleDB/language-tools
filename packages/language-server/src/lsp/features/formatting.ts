import { formatDocument } from "server/formatter/index.js";

import type { FeatureRegistrationContext } from "./context.js";

export function registerFormatting({
    connection,
    documents,
    parser,
}: FeatureRegistrationContext): void {
    connection.onDocumentFormatting((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined ? [] : formatDocument(document, parser);
    });
}

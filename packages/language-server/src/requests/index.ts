import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import { initializeRunQueryRequest, RUN_QUERY_REQUEST } from "./run-query/index.js";

export { RUN_QUERY_REQUEST };

export function initializeCustomRequests(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
): void {
    initializeRunQueryRequest(connection, documents);
}

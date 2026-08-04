import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import { RUN_QUERY_LSP_METHOD, type RunQueryLSPParams } from "../run-query/protocol.js";
import { runQuery, runQueryFromSource } from "../run-query/service.js";

export function initializeCustomRequests(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
): void {
    connection.onRequest(RUN_QUERY_LSP_METHOD, async (params: RunQueryLSPParams) => {
        const document = documents.get(params.uri);
        if (document !== undefined) {
            return runQuery(document);
        }
        return runQueryFromSource(params.uri);
    });
}

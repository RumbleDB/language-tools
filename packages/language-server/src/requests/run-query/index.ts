import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import {
    RUN_QUERY_LSP_METHOD,
    RUN_QUERY_REQUEST,
    type RunQueryLSPParams,
    type RunQueryLSPResult,
} from "./protocol.js";
import { runQuery, runQueryFromSource } from "./service.js";

export { RUN_QUERY_REQUEST, RUN_QUERY_LSP_METHOD };
export type { RunQueryLSPParams, RunQueryLSPResult };

export function initializeRunQueryRequest(
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

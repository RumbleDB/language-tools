import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import {
    runQuery,
    runQueryFromSource,
} from "../../integrations/rumble/operations/run-query/service.js";
import {
    RUN_QUERY_LSP_METHOD,
    RUN_QUERY_REQUEST,
    type RunQueryLSPParams,
    type RunQueryLSPResult,
} from "./protocol.js";

export { RUN_QUERY_REQUEST, RUN_QUERY_LSP_METHOD };
export type { RunQueryLSPParams, RunQueryLSPResult };

export function initializeRunQueryRequest(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
): void {
    connection.onRequest(RUN_QUERY_LSP_METHOD, async (params: RunQueryLSPParams) => {
        if (params.uri !== undefined) {
            const document = documents.get(params.uri);
            if (document !== undefined) {
                return runQuery(document);
            }
        }
        const isUntitled = params.uri?.startsWith("untitled:");
        const uriToPass = isUntitled ? undefined : params.uri;
        return runQueryFromSource(uriToPass, params.query);
    });
}

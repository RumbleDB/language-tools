import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import {
    runQuery,
    runQueryFromSource,
} from "../../../integrations/rumble/operations/run-query/service.js";
import { RUN_QUERY_LSP_METHOD, type RunQueryLSPParams } from "../../protocol/requests/index.js";

export function registerRunQuery(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
): void {
    connection.onRequest(RUN_QUERY_LSP_METHOD, async (params: RunQueryLSPParams) => {
        if (params.uri !== undefined) {
            const document = documents.get(params.uri);
            if (document !== undefined) return runQuery(document);
        }

        const uri = params.uri?.startsWith("untitled:") ? undefined : params.uri;
        return runQueryFromSource(uri, params.query);
    });
}

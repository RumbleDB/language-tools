import type { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import { getWrapperClient } from "server/integrations/rumble/client.js";
import {
    runQuery,
    runQueryFromSource,
} from "server/integrations/rumble/operations/run-query/service.js";
import {
    RUN_QUERY_LSP_METHOD,
    type RunQueryLSPParams,
} from "server/lsp/protocol/requests/index.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

export function registerRunQuery(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
    wrapper: RumbleWrapperClient = getWrapperClient(),
): void {
    connection.onRequest(RUN_QUERY_LSP_METHOD, async (params: RunQueryLSPParams) => {
        if (params.uri !== undefined) {
            const document = documents.get(params.uri);
            if (document !== undefined) return runQuery(document, wrapper);
        }

        const uri = params.uri?.startsWith("untitled:") ? undefined : params.uri;
        return runQueryFromSource(uri, params.query, wrapper);
    });
}

import type { WrapperClient } from "server/integrations/rumble/client.js";
import {
    runQuery,
    runQueryFromSource,
} from "server/integrations/rumble/operations/run-query/service.js";
import {
    RUN_QUERY_LSP_METHOD,
    type RunQueryLSPParams,
} from "server/lsp/protocol/requests/index.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { CancellationToken, Connection, TextDocuments } from "vscode-languageserver/node";

export function registerRunQuery(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
    wrapper: WrapperClient,
): void {
    connection.onRequest(
        RUN_QUERY_LSP_METHOD,
        async (params: RunQueryLSPParams, token: CancellationToken) => {
            const document = documents.get(params.uri);
            return document !== undefined
                ? await runQuery(document, wrapper, token)
                : await runQueryFromSource(params.uri, params.query, wrapper, token);
        },
    );
}

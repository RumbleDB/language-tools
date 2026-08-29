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
            const controller = new AbortController();
            const { dispose } = token.onCancellationRequested(() => controller.abort());
            try {
                if (params.uri !== undefined) {
                    const document = documents.get(params.uri);
                    if (document !== undefined)
                        return await runQuery(document, wrapper, controller.signal);
                }

                const uri = params.uri?.startsWith("untitled:") ? undefined : params.uri;
                return await runQueryFromSource(uri, params.query, wrapper, controller.signal);
            } finally {
                dispose();
            }
        },
    );
}

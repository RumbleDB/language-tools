import type { WrapperClient } from "server/integrations/rumble/client.js";
import { getDocumentText } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";
import type { CancellationToken } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { REQUEST_TYPE_RUN_QUERY, RunQueryRequest, type RunQueryRequestSpec } from "./protocol.js";
import type { RunQueryWireResult } from "./types.js";

const logger = createLogger("run-query");

export async function runQuery(
    document: TextDocument,
    wrapper: WrapperClient,
    token?: CancellationToken,
): Promise<RunQueryWireResult> {
    return runQueryFromSource(document.uri, getDocumentText(document), wrapper, token);
}

export async function runQueryFromSource(
    documentUri: string,
    source: string | undefined,
    client: WrapperClient,
    token?: CancellationToken,
): Promise<RunQueryWireResult> {
    if (!client.isUsable()) {
        const unavailableErr = client.getUnavailableError();
        return {
            items: null,
            itemType: null,
            error: {
                message: unavailableErr
                    ? `Rumble wrapper is unavailable: ${unavailableErr.message}`
                    : "Rumble wrapper is unavailable.",
                code: null,
                location: null,
                range: null,
            },
        };
    }

    const request: RunQueryRequest = {
        requestType: REQUEST_TYPE_RUN_QUERY,
        body: source !== undefined ? Buffer.from(source, "utf8").toString("base64") : undefined,
        documentUri,
    };

    try {
        if (!documentUri) {
            throw new Error("A document URI is required for run-query.");
        }
        // No timeout, since a query may run for long. Cancelling restarts RumbleDB to stop the query.
        const response = await client.sendRequest<RunQueryRequestSpec>(request, {
            token,
            restartOnCancel: true,
        });
        return response.body;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Run-query failed for ${documentUri}: ${message}`);
        return {
            items: null,
            itemType: null,
            error: { message, code: null, location: null, range: null },
        };
    }
}

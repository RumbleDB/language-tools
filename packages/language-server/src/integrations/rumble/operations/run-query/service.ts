import type { WrapperClient } from "server/integrations/rumble/client.js";
import { getDocumentText } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { REQUEST_TYPE_RUN_QUERY, RunQueryRequest, type RunQueryRequestSpec } from "./protocol.js";
import type { RunQueryWireResult } from "./types.js";

const logger = createLogger("run-query");

export async function runQuery(
    document: TextDocument,
    wrapper: WrapperClient,
    signal?: AbortSignal,
): Promise<RunQueryWireResult> {
    return runQueryFromSource(document.uri, getDocumentText(document), wrapper, signal);
}

export async function runQueryFromSource(
    documentUri: string | undefined,
    source: string | undefined,
    client: WrapperClient,
    signal?: AbortSignal,
): Promise<RunQueryWireResult> {
    if (!client.isUsable()) {
        const unavailableErr = client.getUnavailableError();
        return {
            output: null,
            error: unavailableErr
                ? `Rumble wrapper is unavailable: ${unavailableErr.message}`
                : "Rumble wrapper is unavailable.",
        };
    }

    if (source === undefined && documentUri === undefined) {
        return {
            output: null,
            error: "No source or document URI provided for run-query.",
        };
    }

    const request: RunQueryRequest = {
        requestType: REQUEST_TYPE_RUN_QUERY,
        body: source !== undefined ? Buffer.from(source, "utf8").toString("base64") : undefined,
        documentUri,
    };

    try {
        const response = await client.sendRequest<RunQueryRequestSpec>(
            request,
            undefined, // no timeout — rely on AbortSignal for cancellation
            signal,
        );
        return response.body;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Run-query failed for ${documentUri ?? "unknown URI"}: ${message}`);
        return {
            output: null,
            error: message,
        };
    }
}

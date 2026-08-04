import { getDocumentText } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";
import { getWrapperClient } from "server/wrapper/client.js";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { REQUEST_TYPE_RUN_QUERY, RunQueryRequest, type RunQueryRequestSpec } from "./protocol.js";
import type { RunQueryWireResult } from "./types.js";

const logger = createLogger("run-query");

export async function runQuery(document: TextDocument): Promise<RunQueryWireResult> {
    return runQueryFromSource(document.uri, getDocumentText(document));
}

export async function runQueryFromSource(
    documentUri?: string,
    source?: string,
): Promise<RunQueryWireResult> {
    const client = getWrapperClient();
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
        const response = await client.sendRequest<RunQueryRequestSpec>(request);
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

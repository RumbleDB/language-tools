import { getDocumentText } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";
import type { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { getWrapperClient } from "../wrapper/client.js";
import type { WrapperDaemonResponse } from "../wrapper/protocol.js";
import { REQUEST_TYPE_STATIC_TYPECHECK, type StaticTypecheckRequestSpec } from "./protocol.js";
import type { StaticTypecheckWireResult } from "./types.js";

export type StaticTypecheckResponse = WrapperDaemonResponse<
    typeof REQUEST_TYPE_STATIC_TYPECHECK,
    StaticTypecheckWireResult
>;

interface CachedStaticTypecheck {
    version: number;
    response: StaticTypecheckResponse;
}

interface PendingStaticTypecheck {
    version: number;
    promise: Promise<StaticTypecheckResponse>;
}

const staticTypecheckCache = new Map<DocumentUri, CachedStaticTypecheck>();

// Avoid sending multiple identical static typecheck requests for the same document.
const pendingStaticTypecheckByUri = new Map<DocumentUri, PendingStaticTypecheck>();

export function clearStaticTypecheckCache(uri: DocumentUri): void {
    staticTypecheckCache.delete(uri);
    pendingStaticTypecheckByUri.delete(uri);
}

const logger = createLogger("static-typecheck");

function createEmptyStaticTypecheckResponse(): StaticTypecheckResponse {
    return {
        id: 0,
        responseType: REQUEST_TYPE_STATIC_TYPECHECK,
        body: {
            types: [],
            errors: [],
        },
        error: null,
    };
}

export async function getStaticTypecheck(document: TextDocument): Promise<StaticTypecheckResponse> {
    const client = getWrapperClient();

    if (!client.isUsable()) {
        return createEmptyStaticTypecheckResponse();
    }

    const cached = staticTypecheckCache.get(document.uri);
    if (cached !== undefined && cached.version === document.version) {
        return cached.response;
    }

    const pending = pendingStaticTypecheckByUri.get(document.uri);
    if (pending !== undefined && pending.version === document.version) {
        return pending.promise;
    }

    const request = createStaticTypecheckRequest(document);
    const documentVersion = document.version;

    const typecheckPromise = client
        .sendRequest<StaticTypecheckRequestSpec>(request)
        .then((response) => {
            const existingCache = staticTypecheckCache.get(document.uri);
            if (existingCache === undefined || existingCache.version <= documentVersion) {
                staticTypecheckCache.set(document.uri, {
                    version: documentVersion,
                    response,
                });
            }

            logger.debug(
                `Static typecheck completed for ${document.uri} (version ${documentVersion})`,
            );
            logger.debug(JSON.stringify(response, null, 2));
            return response;
        })
        .catch((error) => {
            logger.warn(
                `Static typecheck unavailable for ${document.uri}: ${error instanceof Error ? error.message : String(error)}`,
            );
            return createEmptyStaticTypecheckResponse();
        })
        .finally(() => {
            const pending = pendingStaticTypecheckByUri.get(document.uri);
            if (pending?.promise === typecheckPromise) {
                pendingStaticTypecheckByUri.delete(document.uri);
            }
        });

    pendingStaticTypecheckByUri.set(document.uri, {
        version: documentVersion,
        promise: typecheckPromise,
    });

    return typecheckPromise;
}

function createStaticTypecheckRequest(
    document: TextDocument,
): StaticTypecheckRequestSpec["request"] {
    return {
        requestType: REQUEST_TYPE_STATIC_TYPECHECK,
        body: Buffer.from(getDocumentText(document), "utf8").toString("base64"),
        documentUri: document.uri,
    };
}

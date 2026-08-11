import { getDocumentText } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { sameDocumentStamp, type DocumentStamp } from "../workspace/document-stamp.js";
import { getWrapperClient } from "../wrapper/client.js";
import type { WrapperDaemonResponse } from "../wrapper/protocol.js";
import { REQUEST_TYPE_STATIC_TYPECHECK, type StaticTypecheckRequestSpec } from "./protocol.js";
import type { StaticTypecheckWireResult } from "./types.js";

export type StaticTypecheckResponse = WrapperDaemonResponse<
    typeof REQUEST_TYPE_STATIC_TYPECHECK,
    StaticTypecheckWireResult
>;

interface CachedStaticTypecheck {
    stamp: DocumentStamp;
    response: StaticTypecheckResponse;
}

interface PendingStaticTypecheck {
    stamp: DocumentStamp;
    promise: Promise<StaticTypecheckResponse>;
    cancelBeforeStart: () => void;
}

interface DebouncedStaticTypecheckResult {
    response: StaticTypecheckResponse;
    cacheable: boolean;
}

const staticTypecheckCache = new Map<string, CachedStaticTypecheck>();

const pendingStaticTypecheckByUri = new Map<string, PendingStaticTypecheck>();
const STATIC_TYPECHECK_DEBOUNCE_MS = 250;

const logger = createLogger("static-typecheck");

export function cancelPendingStaticTypecheck(uri: string): void {
    const pending = pendingStaticTypecheckByUri.get(uri);
    if (pending === undefined) return;

    pendingStaticTypecheckByUri.delete(uri);
    pending.cancelBeforeStart();
}

export function supersedePendingStaticTypecheck(stamp: DocumentStamp): void {
    const pending = pendingStaticTypecheckByUri.get(stamp.uri);
    if (pending === undefined || sameDocumentStamp(pending.stamp, stamp)) return;
    cancelPendingStaticTypecheck(stamp.uri);
}

function createEmptyStaticTypecheckResponse(): StaticTypecheckResponse {
    return {
        id: 0,
        responseType: REQUEST_TYPE_STATIC_TYPECHECK,
        body: {
            errors: [],
        },
        error: null,
    };
}

export async function getStaticTypecheck(
    document: TextDocument,
    stamp: DocumentStamp,
): Promise<StaticTypecheckResponse> {
    const client = getWrapperClient();

    if (!client.isUsable()) {
        return createEmptyStaticTypecheckResponse();
    }

    const cached = staticTypecheckCache.get(document.uri);
    if (cached !== undefined && sameDocumentStamp(cached.stamp, stamp)) {
        return cached.response;
    }

    const pending = pendingStaticTypecheckByUri.get(document.uri);
    if (pending !== undefined && sameDocumentStamp(pending.stamp, stamp)) {
        return pending.promise;
    }
    cancelPendingStaticTypecheck(document.uri);

    const request = createStaticTypecheckRequest(document);
    let requestStarted = false;
    let cancelBeforeStart = (): void => {};
    const backendResult = new Promise<DebouncedStaticTypecheckResult>((resolve) => {
        const timeout = setTimeout(() => {
            requestStarted = true;
            void client
                .sendRequest<StaticTypecheckRequestSpec>(request)
                .then((response) => resolve({ response, cacheable: true }))
                .catch((error: unknown) => {
                    logger.warn(
                        `Static typecheck unavailable for ${document.uri}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                    resolve({
                        response: createEmptyStaticTypecheckResponse(),
                        cacheable: false,
                    });
                });
        }, STATIC_TYPECHECK_DEBOUNCE_MS);

        cancelBeforeStart = () => {
            if (requestStarted) return;
            clearTimeout(timeout);
            resolve({ response: createEmptyStaticTypecheckResponse(), cacheable: false });
        };
    });

    const typecheckPromise = backendResult
        .then(({ response, cacheable }) => {
            const pending = pendingStaticTypecheckByUri.get(document.uri);
            if (pending?.promise !== typecheckPromise) return response;

            if (cacheable) staticTypecheckCache.set(document.uri, { stamp, response });

            logger.debug(
                `Static typecheck completed for ${document.uri} ` +
                    `(document ${stamp.documentVersion}, workspace ${stamp.workspaceRevision})`,
            );
            logger.debug(JSON.stringify(response, null, 2));
            return response;
        })
        .finally(() => {
            const pending = pendingStaticTypecheckByUri.get(document.uri);
            if (pending?.promise === typecheckPromise) {
                pendingStaticTypecheckByUri.delete(document.uri);
            }
        });

    pendingStaticTypecheckByUri.set(document.uri, {
        stamp,
        promise: typecheckPromise,
        cancelBeforeStart,
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

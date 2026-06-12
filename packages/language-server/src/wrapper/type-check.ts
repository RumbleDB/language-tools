import { getDocumentText } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";
import type { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { getWrapperClient } from "./client.js";
import type { WrapperDaemonResponse } from "./protocol.js";
import type { TypeInferenceResult } from "./types.js";

export const REQUEST_TYPE_STATIC_TYPECHECK = "static-typecheck" as const;

export interface StaticTypeCheckRequest {
    requestType: typeof REQUEST_TYPE_STATIC_TYPECHECK;
    body: string;
    documentUri: string;
}

export type TypeInferenceResponse = WrapperDaemonResponse<
    typeof REQUEST_TYPE_STATIC_TYPECHECK,
    TypeInferenceResult
>;

interface CachedTypeInference {
    version: number;
    response: TypeInferenceResponse;
}

const typeInferenceCache = new Map<DocumentUri, CachedTypeInference>();

// Avoid sending multiple identical inference requests for the same document.
const pendingInferenceByUri = new Map<DocumentUri, Promise<TypeInferenceResponse>>();

export function clearTypeInferenceCache(uri: DocumentUri): void {
    typeInferenceCache.delete(uri);
    pendingInferenceByUri.delete(uri);
}

const logger = createLogger("type-inference");

export async function getTypeInference(document: TextDocument): Promise<TypeInferenceResponse> {
    const cached = typeInferenceCache.get(document.uri);
    if (cached !== undefined && cached.version === document.version) {
        return cached.response;
    }

    const pending = pendingInferenceByUri.get(document.uri);
    if (pending !== undefined) {
        return pending;
    }

    const body = Buffer.from(getDocumentText(document), "utf8").toString("base64");

    const inferencePromise = getWrapperClient()
        .sendRequest<"static-typecheck">({
            requestType: "static-typecheck",
            body,
            documentUri: document.uri,
        })
        .then((response) => {
            typeInferenceCache.set(document.uri, {
                version: document.version,
                response,
            });
            pendingInferenceByUri.delete(document.uri);

            logger.debug(
                `Type inference completed for ${document.uri} (version ${document.version})`,
            );
            logger.debug(JSON.stringify(response, null, 2));
            return response;
        });

    pendingInferenceByUri.set(document.uri, inferencePromise);

    return inferencePromise;
}

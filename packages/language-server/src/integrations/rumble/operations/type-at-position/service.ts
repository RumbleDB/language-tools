import type { WrapperClient } from "server/integrations/rumble/client.js";
import { getDocumentText } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";
import type { Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import {
    REQUEST_TYPE_TYPE_AT_POSITION,
    type TypeAtPositionRequestSpec,
    type TypeAtPositionWireResult,
} from "./protocol.js";

const logger = createLogger("type-at-position");

const EMPTY_RESULT: TypeAtPositionWireResult = {};

export async function getTypeAtPosition(
    document: TextDocument,
    position: Position,
    wrapper: WrapperClient,
): Promise<TypeAtPositionWireResult> {
    return getTypeAtPositionFromSource(document.uri, getDocumentText(document), position, wrapper);
}

export async function getTypeAtPositionFromSource(
    documentUri: string,
    source: string,
    position: Position,
    wrapper: WrapperClient,
): Promise<TypeAtPositionWireResult> {
    const client = wrapper;
    if (!client.isUsable()) {
        return EMPTY_RESULT;
    }

    try {
        const response = await client.sendRequest<TypeAtPositionRequestSpec>({
            requestType: REQUEST_TYPE_TYPE_AT_POSITION,
            body: Buffer.from(source, "utf8").toString("base64"),
            documentUri,
            position,
        });

        return response.body;
    } catch (error) {
        logger.warn(
            `Type-at-position unavailable for ${documentUri}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return EMPTY_RESULT;
    }
}

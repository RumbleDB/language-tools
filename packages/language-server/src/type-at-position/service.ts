import { getDocumentText } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";
import type { Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { getWrapperClient } from "../wrapper/client.js";
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
): Promise<TypeAtPositionWireResult> {
    const client = getWrapperClient();
    if (!client.isUsable()) {
        return EMPTY_RESULT;
    }

    try {
        const response = await client.sendRequest<TypeAtPositionRequestSpec>({
            requestType: REQUEST_TYPE_TYPE_AT_POSITION,
            body: Buffer.from(getDocumentText(document), "utf8").toString("base64"),
            documentUri: document.uri,
            position,
        });

        return response.body;
    } catch (error) {
        logger.warn(
            `Type-at-position unavailable for ${document.uri}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return EMPTY_RESULT;
    }
}

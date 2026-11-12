import type { WrapperClient } from "server/integrations/rumble/client.js";
import { getDocumentText } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";
import type { CancellationToken, Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import {
    REQUEST_TYPE_FOCUS_AT_POSITION,
    type FocusAtPositionRequestSpec,
    type FocusAtPositionWireResult,
} from "./protocol.js";

const logger = createLogger("focus-at-position");

const EMPTY_RESULT: FocusAtPositionWireResult = {};

/** What a lookup key or path step at the position applies to. Empty when the wrapper is unusable, fails or is cancelled. */
export async function getFocusAtPosition(
    document: TextDocument,
    position: Position,
    wrapper: WrapperClient,
    token?: CancellationToken,
): Promise<FocusAtPositionWireResult> {
    if (!wrapper.isUsable()) {
        return EMPTY_RESULT;
    }

    try {
        const response = await wrapper.sendRequest<FocusAtPositionRequestSpec>(
            {
                requestType: REQUEST_TYPE_FOCUS_AT_POSITION,
                body: Buffer.from(getDocumentText(document), "utf8").toString("base64"),
                documentUri: document.uri,
                position,
            },
            { token },
        );

        return response.body;
    } catch (error) {
        // Requests are cancelled as the user types, which is not worth a warning.
        if (token?.isCancellationRequested === true) {
            return EMPTY_RESULT;
        }
        logger.warn(
            `Focus-at-position unavailable for ${document.uri}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return EMPTY_RESULT;
    }
}

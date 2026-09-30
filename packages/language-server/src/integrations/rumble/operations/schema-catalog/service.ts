import type { WrapperClient } from "server/integrations/rumble/client.js";
import { getDocumentText } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";
import type { TextDocument } from "vscode-languageserver-textdocument";

import {
    REQUEST_TYPE_SCHEMA_CATALOG,
    type SchemaCatalogRequestSpec,
    type SchemaCatalogWireResult,
} from "./protocol.js";

const logger = createLogger("schema-catalog");
const EMPTY_RESULT: SchemaCatalogWireResult = { types: [], constructors: [], errors: [] };

export async function getSchemaCatalog(
    document: TextDocument,
    client: WrapperClient,
): Promise<SchemaCatalogWireResult> {
    if (!client.isUsable()) {
        return EMPTY_RESULT;
    }

    try {
        const response = await client.sendRequest<SchemaCatalogRequestSpec>({
            requestType: REQUEST_TYPE_SCHEMA_CATALOG,
            body: Buffer.from(getDocumentText(document), "utf8").toString("base64"),
            documentUri: document.uri,
        });
        if (response.error != null) {
            throw new Error(response.error.message);
        }
        return response.body;
    } catch (error) {
        logger.warn(
            `Schema catalog unavailable for ${document.uri}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return EMPTY_RESULT;
    }
}

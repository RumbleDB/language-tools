import type { WrapperClient } from "server/integrations/rumble/client.js";
import { createLogger } from "server/utils/logger.js";

import {
    REQUEST_TYPE_SCHEMA_CATALOG,
    type SchemaCatalogRequestSpec,
    type SchemaCatalogInput,
    type SchemaCatalogWireResult,
} from "./protocol.js";

const logger = createLogger("schema-catalog");
/** Undefined means the request was unavailable or failed, rather than a valid empty catalog. */
export async function getSchemaCatalog(
    documentUri: string,
    input: SchemaCatalogInput,
    client: WrapperClient,
): Promise<SchemaCatalogWireResult | undefined> {
    if (!client.isUsable()) {
        return undefined;
    }

    try {
        const response = await client.sendRequest<SchemaCatalogRequestSpec>({
            requestType: REQUEST_TYPE_SCHEMA_CATALOG,
            body: Buffer.from(JSON.stringify(input), "utf8").toString("base64"),
            documentUri,
        });
        if (response.error != null) {
            throw new Error(response.error.message);
        }
        return response.body;
    } catch (error) {
        logger.warn(
            `Schema catalog unavailable for ${documentUri}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return undefined;
    }
}

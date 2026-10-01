import type { FunctionName, QName } from "server/analysis/model/names.js";
import type { StaticFunctionSignature } from "server/analysis/model/type-system.js";
import type { WrapperRequestSpec } from "server/integrations/rumble/protocol.js";

import type { StaticTypecheckError } from "../static-typecheck/types.js";

export const REQUEST_TYPE_SCHEMA_CATALOG = "schema-catalog" as const;

export interface SchemaCatalogInput {
    imports: { namespaceUri: string; locations: string[] }[];
    baseUri?: string;
}

export interface SchemaCatalogRequest {
    requestType: typeof REQUEST_TYPE_SCHEMA_CATALOG;
    body: string;
    documentUri: string;
}

export interface SchemaCatalogWireResult {
    types: QName[];
    constructors: { name: FunctionName; signature: StaticFunctionSignature }[];
    /** Absolute schema URIs attempted by Rumble, including imports, includes, and failed reads. */
    dependencies?: string[];
    errors: StaticTypecheckError[];
}

export type SchemaCatalogRequestSpec = WrapperRequestSpec<
    typeof REQUEST_TYPE_SCHEMA_CATALOG,
    SchemaCatalogRequest,
    SchemaCatalogWireResult
>;

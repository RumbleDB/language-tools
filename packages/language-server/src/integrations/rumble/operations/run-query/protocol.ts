import type { WrapperRequestSpec } from "server/integrations/rumble/protocol.js";

import type { RunQueryWireResult } from "./types.js";

export const REQUEST_TYPE_RUN_QUERY = "run-query" as const;

export interface RunQueryRequest {
    requestType: typeof REQUEST_TYPE_RUN_QUERY;
    body: string | undefined;
    documentUri: string | undefined;
}

export type RunQueryRequestSpec = WrapperRequestSpec<
    typeof REQUEST_TYPE_RUN_QUERY,
    RunQueryRequest,
    RunQueryWireResult
>;

import type { WrapperRequestSpec } from "server/integrations/rumble/protocol.js";

import type { StaticTypecheckWireResult } from "./types.js";

export const REQUEST_TYPE_STATIC_TYPECHECK = "static-typecheck" as const;

export interface StaticTypecheckRequest {
    requestType: typeof REQUEST_TYPE_STATIC_TYPECHECK;
    body: string;
    documentUri: string;
}

export type StaticTypecheckRequestSpec = WrapperRequestSpec<
    typeof REQUEST_TYPE_STATIC_TYPECHECK,
    StaticTypecheckRequest,
    StaticTypecheckWireResult
>;

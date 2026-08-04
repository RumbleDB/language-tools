import type { WrapperRequestSpec } from "../wrapper/protocol.js";
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

export const RUN_QUERY_LSP_METHOD = "jsoniq/runQuery" as const;

export interface RunQueryLSPParams {
    uri: string;
}

export interface RunQueryLSPResult {
    output: string | null;
    error: string | null;
}

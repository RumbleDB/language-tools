import { defineRequest } from "./types.js";

export const RUN_QUERY_LSP_METHOD = "jsoniq/runQuery" as const;

export interface RunQueryLSPParams {
    uri?: string;
    query?: string;
}

export interface RunQueryLSPResult {
    output: string | null;
    error: string | null;
}

export const RUN_QUERY_REQUEST = defineRequest<
    typeof RUN_QUERY_LSP_METHOD,
    RunQueryLSPParams,
    RunQueryLSPResult
>(RUN_QUERY_LSP_METHOD);

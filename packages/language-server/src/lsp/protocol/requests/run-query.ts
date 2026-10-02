import type { Range } from "vscode-languageserver";

import { defineRequest } from "./types.js";

export const RUN_QUERY_LSP_METHOD = "jsoniq/runQuery" as const;

export interface RunQueryLSPParams {
    uri?: string;
    query?: string;
}

export interface RunQueryError {
    message: string;
    code: string | null;
    /** URI of the module containing the error, when known. */
    location: string | null;
    /** Source range using zero-based LSP positions, when known. */
    range: Range | null;
}

export interface RunQueryLSPResult {
    output: string | null;
    error: RunQueryError | null;
}

export const RUN_QUERY_REQUEST = defineRequest<
    typeof RUN_QUERY_LSP_METHOD,
    RunQueryLSPParams,
    RunQueryLSPResult
>(RUN_QUERY_LSP_METHOD);

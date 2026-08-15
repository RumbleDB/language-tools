import { RequestClient } from "server/requests/types.js";

export const RUN_QUERY_LSP_METHOD = "jsoniq/runQuery" as const;

export interface RunQueryLSPParams {
    uri?: string;
    query?: string;
}

export interface RunQueryLSPResult {
    output: string | null;
    error: string | null;
}

export const RUN_QUERY_REQUEST = {
    method: RUN_QUERY_LSP_METHOD,
    send: (client: RequestClient, params: RunQueryLSPParams): Promise<RunQueryLSPResult> => {
        return client.sendRequest<RunQueryLSPResult>(RUN_QUERY_LSP_METHOD, params);
    },
};

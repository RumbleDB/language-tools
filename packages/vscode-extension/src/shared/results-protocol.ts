import type { RunQueryError, RunQueryItem } from "jsoniq-language-server/requests";

export interface QueryExecutionError extends RunQueryError {
    /** Bounded source excerpt, prepared by the extension for display. */
    sourceLines?: {
        number: number;
        highlighted: boolean;
        before: string;
        selected: string;
        after: string;
    }[];
}

export interface ExecutionResultData {
    fileUri: string;
    items: RunQueryItem[] | null;
    error?: QueryExecutionError;
    durationMs: number;
    timestamp: string;
}

export interface ExportResultsRequest {
    type: "EXPORT_RESULTS";
    csv: string;
    sequence: string;
}

export interface OpenErrorLocationRequest {
    type: "OPEN_ERROR_LOCATION";
    location: string;
    range?: NonNullable<QueryExecutionError["range"]>;
}

export type ResultsRequest =
    | ExportResultsRequest
    | OpenErrorLocationRequest
    | { type: "RERUN_QUERY" };
export type ResultsResponse =
    | { type: "SET_DATA"; data: ExecutionResultData }
    | { type: "SET_RUNNING"; running: boolean }
    | { type: "OPEN_ERROR_LOCATION_ERROR"; message: string };

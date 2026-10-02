import type { RunQueryError, RunQueryItem } from "jsoniq-language-server/requests";

export interface ExecutionResultData {
    fileUri: string;
    items: RunQueryItem[] | null;
    error?: RunQueryError;
    /** Text of the reported error file, supplied by the extension. */
    sourceText?: string;
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
    range?: NonNullable<RunQueryError["range"]>;
}

export type ResultsRequest =
    | ExportResultsRequest
    | OpenErrorLocationRequest
    | { type: "RERUN_QUERY" };
export type ResultsResponse =
    | { type: "SET_DATA"; data: ExecutionResultData }
    | { type: "SET_RUNNING"; running: boolean }
    | { type: "OPEN_ERROR_LOCATION_ERROR"; message: string };

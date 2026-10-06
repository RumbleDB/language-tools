import type {
    RunQueryError,
    RunQueryItem,
    RunQueryItemType,
} from "jsoniq-language-server/requests";

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
    itemType: RunQueryItemType | null;
    error?: QueryExecutionError;
    durationMs: number;
    timestamp: string;
}

export interface OpenErrorLocationRequest {
    type: "OPEN_ERROR_LOCATION";
    location: string;
    range?: NonNullable<QueryExecutionError["range"]>;
}

export interface OpenRawOutputRequest {
    type: "OPEN_RAW_OUTPUT";
    sequence: string;
}

export type ResultsRequest =
    | OpenErrorLocationRequest
    | OpenRawOutputRequest
    | { type: "RERUN_QUERY" };

export type ResultsResponse =
    | { type: "SET_DATA"; data: ExecutionResultData }
    | { type: "SET_RUNNING"; running: boolean }
    | { type: "OPEN_ERROR_LOCATION_ERROR"; message: string };

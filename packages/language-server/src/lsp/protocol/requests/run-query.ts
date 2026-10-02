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

/** Typed inspection data. Numeric lexical values remain strings to preserve precision. */
export interface RunQueryItem {
    kind: "atomic" | "null" | "object" | "map" | "array" | "node" | "function";
    /** Engine's display name for the dynamic type. */
    type: string;
    /** Expanded QName for named types, independent of namespace prefixes. */
    typeName?: string;
    /** Backend adaptive serialization, or null when serialization is unavailable. */
    serialized: string | null;
    serializationError?: string;
    lexicalValue?: string;
    nodeKind?: string;
    /** Entries preserve typed keys and sequence-valued map entries. */
    entries?: { key: RunQueryItem; value: RunQueryItem[] }[];
    /** Each array member is a sequence, including empty and multi-item sequences. */
    members?: RunQueryItem[][];
    function?: { name: string; arity: number; signature: string };
}

export interface RunQueryLSPResult {
    error: RunQueryError | null;
    /** Ordered sequence; [] means an empty result, null means no result is available. */
    items: RunQueryItem[] | null;
}

export const RUN_QUERY_REQUEST = defineRequest<
    typeof RUN_QUERY_LSP_METHOD,
    RunQueryLSPParams,
    RunQueryLSPResult
>(RUN_QUERY_LSP_METHOD);

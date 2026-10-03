import type { Range } from "vscode-languageserver";

import { defineRequest } from "./types.js";

export const RUN_QUERY_LSP_METHOD = "jsoniq/runQuery" as const;

export interface RunQueryLSPParams {
    uri: string;
    query?: string;
    /** Base URI for execution when the source is a virtual document, such as a notebook cell. */
    baseUri?: string;
}

export interface RunQueryError {
    message: string;
    code: string | null;
    /** URI of the module containing the error, when known. */
    location: string | null;
    /** Source range using zero-based LSP positions, when known. */
    range: Range | null;
}

export interface RunQueryItemType {
    /** Engine's display name for the dynamic type. */
    displayName: string;
    /** Expanded QName for named types, independent of namespace prefixes. */
    qname?: string;
}

interface RunQueryItemBase {
    type: RunQueryItemType;
    /** Backend adaptive serialization; failures are reported as run-query errors. */
    serialized: string;
}

/** The engine permits atomic keys, including null, in maps. */
export type RunQueryAtomicItem = RunQueryItemBase & { kind: "atomic" | "null" };

/** Each kind carries its required structure; numeric values stay serialized strings. */
export type RunQueryItem =
    | RunQueryAtomicItem
    | (RunQueryItemBase & {
          kind: "object";
          fields: { name: string; value: RunQueryItem[] }[];
      })
    | (RunQueryItemBase & {
          kind: "map";
          entries: { key: RunQueryAtomicItem; value: RunQueryItem[] }[];
      })
    | (RunQueryItemBase & {
          kind: "array";
          /** Each member is a sequence, including empty and multi-item sequences. */
          members: RunQueryItem[][];
      })
    | (RunQueryItemBase & { kind: "node"; nodeKind: string })
    | (RunQueryItemBase & {
          kind: "function";
          name: string;
          arity: number;
          signature: string;
      });

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

import type { TypeDefinition } from "server/types/type-system.js";
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

/** Runtime descriptors use the shared type model and always include the engine's display name. */
export type RunQueryItemType = TypeDefinition & { displayName: string };

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
    /**
     * The engine's least common supertype of all items; null for an empty result. A result of objects
     * yields an object type whose fields are optional when some object lacks them.
     */
    itemType: RunQueryItemType | null;
}

export const RUN_QUERY_REQUEST = defineRequest<
    typeof RUN_QUERY_LSP_METHOD,
    RunQueryLSPParams,
    RunQueryLSPResult
>(RUN_QUERY_LSP_METHOD);

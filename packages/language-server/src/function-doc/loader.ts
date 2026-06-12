import { loadFunctionDocs } from "server/assets/loader.js";

import type { FunctionEntry } from "./types.js";

export function getFunctionDocs(): Record<string, FunctionEntry> {
    return loadFunctionDocs();
}

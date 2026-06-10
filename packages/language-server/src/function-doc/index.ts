import { expandedQNameToString, ResolvedQName } from "server/analysis/names.js";

import { formatFunctionEntry } from "./format.js";
import { getFunctionDocs } from "./loader.js";
import type { FunctionEntry, Parameter, Signature } from "./types.js";

export type { FunctionEntry, Parameter, Signature };

export function getBuiltinFunctionDocumentation(
    name: ResolvedQName,
    arity?: number,
): string | undefined {
    const key = expandedQNameToString(name);
    const docs = getFunctionDocs();
    const entry = docs[key];

    if (!entry) {
        console.warn(`No documentation found for function: ${key}`);
        return undefined;
    }

    return formatFunctionEntry(entry, arity);
}

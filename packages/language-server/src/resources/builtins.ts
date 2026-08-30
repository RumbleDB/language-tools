import type { BuiltinDefinitionByReferenceKind } from "server/analysis/model/definitions.js";
import type { FunctionName, QName, ReferenceNameByKind } from "server/analysis/model/names.js";

import { builtinFunctions } from "./builtin-functions.js";
import { builtinTypes } from "./builtin-types.js";

export function resolveBuiltin<K extends keyof ReferenceNameByKind>(
    kind: K,
    name: ReferenceNameByKind[K],
): BuiltinDefinitionByReferenceKind[K] | undefined {
    if (kind === "function") {
        return builtinFunctions.find(name as FunctionName) as BuiltinDefinitionByReferenceKind[K];
    }
    if (kind === "type") {
        return builtinTypes.find(name as QName) as BuiltinDefinitionByReferenceKind[K];
    }
    return undefined;
}

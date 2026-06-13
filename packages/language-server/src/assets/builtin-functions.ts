import {
    ARRAY_NAMESPACE,
    FN_NAMESPACE,
    JN_NAMESPACE,
    MAP_NAMESPACE,
    MATH_NAMESPACE,
} from "server/analysis/default-namespaces.js";
import { BaseDefinition } from "server/analysis/definitions.js";
import { functionNameToString, type FunctionName } from "server/analysis/names.js";
import { type StaticFunctionSignature } from "server/static-typecheck/types.js";

import { loadJsonAsset } from "./loader.js";

export interface BuiltinFunctionDefinition extends BaseDefinition<"builtin-function"> {
    name: FunctionName;
    kind: "builtin-function";
    signature: StaticFunctionSignature;
    isBuiltin: true;
}

const BUILTIN_FUNCTION_NAMESPACES = [
    FN_NAMESPACE,
    JN_NAMESPACE,
    MATH_NAMESPACE,
    MAP_NAMESPACE,
    ARRAY_NAMESPACE,
] as const;

function findBuiltinFunctionDefinition(
    map: Map<string, BuiltinFunctionDefinition>,
    name: FunctionName,
): BuiltinFunctionDefinition | undefined {
    const direct = map.get(functionNameToString(name, true));
    if (direct !== undefined) {
        return direct;
    }

    if (name.qname.namespaceUri !== undefined || name.qname.prefix !== undefined) {
        return undefined;
    }

    for (const namespaceUri of BUILTIN_FUNCTION_NAMESPACES) {
        const candidate = map.get(
            functionNameToString(
                {
                    ...name,
                    qname: {
                        localName: name.qname.localName,
                        namespaceUri,
                    },
                },
                true,
            ),
        );
        if (candidate !== undefined) {
            return candidate;
        }
    }

    return undefined;
}

const map = new Map<string, BuiltinFunctionDefinition>();
const catalog =
    loadJsonAsset<
        Array<{
            name: FunctionName;
            signature: StaticFunctionSignature;
        }>
    >("builtin-functions.json") || [];

for (const func of catalog) {
    const name = func.name;
    map.set(functionNameToString(name, true), {
        name,
        kind: "builtin-function",
        signature: func.signature,
        references: [],
        isBuiltin: true,
    });
}

export const builtinFunctions = {
    all: [...map.values()],
    find: (name: FunctionName) => findBuiltinFunctionDefinition(map, name),
};

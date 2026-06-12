import {
    ARRAY_NAMESPACE,
    FN_NAMESPACE,
    JN_NAMESPACE,
    MAP_NAMESPACE,
    MATH_NAMESPACE,
} from "server/analysis/default-namespaces.js";
import { BaseDefinition } from "server/analysis/definitions.js";
import { loadBuiltinFunctions } from "server/assets/loader.js";

import { functionNameToString, type FunctionName } from "../analysis/names.js";
import { type WrapperFunctionSignature } from "./types.js";

export interface BuiltinFunctionDefinition extends BaseDefinition<"builtin-function"> {
    name: FunctionName;
    kind: "builtin-function";
    signature: WrapperFunctionSignature;
    isBuiltin: true;
}

const BUILTIN_FUNCTION_NAMESPACES = [
    FN_NAMESPACE,
    JN_NAMESPACE,
    MATH_NAMESPACE,
    MAP_NAMESPACE,
    ARRAY_NAMESPACE,
] as const;

let builtinDefinitionsPromise: Promise<Map<string, BuiltinFunctionDefinition>> | null = null;

async function getBuiltinFunctionMap(): Promise<Map<string, BuiltinFunctionDefinition>> {
    if (builtinDefinitionsPromise !== null) {
        return builtinDefinitionsPromise;
    }

    builtinDefinitionsPromise = (async () => {
        const builtinDefinitionsByName = new Map<string, BuiltinFunctionDefinition>();

        const builtinFunctions = loadBuiltinFunctions();
        for (const builtinFunction of builtinFunctions) {
            const name = builtinFunction.name;
            builtinDefinitionsByName.set(functionNameToString(name, true), {
                name,
                kind: "builtin-function",
                signature: builtinFunction.signature,
                references: [],
                isBuiltin: true,
            });
        }

        return builtinDefinitionsByName;
    })();

    return builtinDefinitionsPromise;
}

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

export type BuiltinFunctions = {
    all: BuiltinFunctionDefinition[];
    find: (name: FunctionName) => BuiltinFunctionDefinition | undefined;
};

export async function getBuiltinFunctions(): Promise<BuiltinFunctions> {
    const map = await getBuiltinFunctionMap();
    return {
        all: [...map.values()],
        find: (name: FunctionName) => findBuiltinFunctionDefinition(map, name),
    };
}

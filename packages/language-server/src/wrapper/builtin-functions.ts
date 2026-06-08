import {
    ARRAY_NAMESPACE,
    FN_NAMESPACE,
    JN_NAMESPACE,
    MAP_NAMESPACE,
    MATH_NAMESPACE,
} from "server/analysis/default-namespaces.js";
import type { BaseDefinition } from "server/analysis/model.js";
import { createLogger } from "server/utils/logger.js";

import { expandedQNameToString, type ResolvedFunctionName } from "../analysis/names.js";
import { getWrapperClient } from "./client.js";
import type { WrapperDaemonResponse } from "./protocol.js";
import { type BuiltinFunctionsResponseBody, type WrapperFunctionSignature } from "./types.js";

export const REQUEST_TYPE_BUILTIN_FUNCTIONS = "builtinFunctions" as const;

export interface BuiltinFunctionsRequestPayload {
    requestType: typeof REQUEST_TYPE_BUILTIN_FUNCTIONS;
}

export type BuiltinFunctionListResponse = WrapperDaemonResponse<
    typeof REQUEST_TYPE_BUILTIN_FUNCTIONS,
    BuiltinFunctionsResponseBody
>;

export interface BuiltinFunctionDefinition extends BaseDefinition<"builtin-function"> {
    name: ResolvedFunctionName;
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

const BUILTIN_FUNCTIONS_REQUEST: BuiltinFunctionsRequestPayload = {
    requestType: REQUEST_TYPE_BUILTIN_FUNCTIONS,
};

let builtinDefinitionsPromise: Promise<Map<string, BuiltinFunctionDefinition>> | null = null;
const logger = createLogger("wrapper:builtin-functions");

function getBuiltinFunctionKey(name: ResolvedFunctionName): string {
    return `${expandedQNameToString(name.qname)}#${name.arity ?? "?"}`;
}

async function getBuiltinFunctionMap(): Promise<Map<string, BuiltinFunctionDefinition>> {
    if (builtinDefinitionsPromise !== null) {
        return builtinDefinitionsPromise;
    }

    builtinDefinitionsPromise = (async () => {
        const response = await getWrapperClient()
            .sendRequest<typeof REQUEST_TYPE_BUILTIN_FUNCTIONS>(BUILTIN_FUNCTIONS_REQUEST)
            .catch((error) => {
                logger.warn(
                    `Failed to fetch builtin function definitions from wrapper: ${String(error)}`,
                );
                return undefined;
            });

        const builtinDefinitionsByName = new Map<string, BuiltinFunctionDefinition>();

        if (response !== undefined) {
            for (const builtinFunction of response.body.builtinFunctions) {
                const name = builtinFunction.name;
                builtinDefinitionsByName.set(getBuiltinFunctionKey(name), {
                    name,
                    kind: "builtin-function",
                    signature: builtinFunction.signature,
                    references: [],
                    isBuiltin: true,
                });
            }
        }

        return builtinDefinitionsByName;
    })();

    return builtinDefinitionsPromise;
}

function findBuiltinFunctionDefinition(
    map: Map<string, BuiltinFunctionDefinition>,
    name: ResolvedFunctionName,
): BuiltinFunctionDefinition | undefined {
    const direct = map.get(getBuiltinFunctionKey(name));
    if (direct !== undefined) {
        return direct;
    }

    if (name.qname.namespaceUri !== undefined || name.qname.prefix !== undefined) {
        return undefined;
    }

    for (const namespaceUri of BUILTIN_FUNCTION_NAMESPACES) {
        const candidate = map.get(
            getBuiltinFunctionKey({
                ...name,
                qname: {
                    localName: name.qname.localName,
                    namespaceUri,
                },
            }),
        );
        if (candidate !== undefined) {
            return candidate;
        }
    }

    return undefined;
}

export type BuiltinFunctions = {
    all: BuiltinFunctionDefinition[];
    find: (name: ResolvedFunctionName) => BuiltinFunctionDefinition | undefined;
};

export async function getBuiltinFunctions(): Promise<BuiltinFunctions> {
    const map = await getBuiltinFunctionMap();
    return {
        all: [...map.values()],
        find: (name: ResolvedFunctionName) => findBuiltinFunctionDefinition(map, name),
    };
}

import {
    ARRAY_NAMESPACE,
    FN_NAMESPACE,
    JN_NAMESPACE,
    MAP_NAMESPACE,
    MATH_NAMESPACE,
} from "server/analysis/model/constants.js";
import type { BuiltinFunctionDefinition } from "server/analysis/model/definitions.js";
import { functionNameToString, type FunctionName } from "server/analysis/model/names.js";
import type { StaticFunctionSignature } from "server/analysis/model/type-system.js";

export type { BuiltinFunctionDefinition };

import { loadJsonAsset } from "./loader.js";

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

type CatalogEntry = { name: FunctionName; signature: StaticFunctionSignature };
type Language = "jsoniq" | "xquery";

const map = new Map<string, BuiltinFunctionDefinition>();
const catalog = loadJsonAsset<CatalogEntry[]>("builtin-functions.json") || [];

for (const func of catalog) {
    const name = func.name;
    map.set(functionNameToString(name, true), {
        name,
        kind: "function",
        signature: func.signature,
        origin: "builtin",
    });
}

const constructors = loadJsonAsset<Record<Language, CatalogEntry[]>>("builtin-constructors.json");

function createConstructorMap(language: Language): Map<string, BuiltinFunctionDefinition> {
    const result = new Map<string, BuiltinFunctionDefinition>();
    for (const entry of constructors?.[language] ?? []) {
        const definition: BuiltinFunctionDefinition = {
            ...entry,
            kind: "function",
            origin: "builtin",
        };
        result.set(functionNameToString(entry.name, true), definition);
        // Unprefixed JSONiq aliases retain their namespace in the exported definition.
        if (entry.name.qname.prefix === undefined) {
            result.set(
                functionNameToString(
                    { ...entry.name, qname: { localName: entry.name.qname.localName } },
                    true,
                ),
                definition,
            );
        }
    }
    return result;
}

const constructorMaps = {
    jsoniq: createConstructorMap("jsoniq"),
    xquery: createConstructorMap("xquery"),
};
const functionsByLanguage = {
    jsoniq: [...map.values(), ...new Set(constructorMaps.jsoniq.values())],
    xquery: [...map.values(), ...new Set(constructorMaps.xquery.values())],
};

export const builtinFunctions = {
    all: [...map.values()],
    forLanguage: (language: Language) => functionsByLanguage[language],
    find: (name: FunctionName, language: Language = "jsoniq") =>
        findBuiltinFunctionDefinition(map, name) ??
        constructorMaps[language].get(functionNameToString(name, true)),
};

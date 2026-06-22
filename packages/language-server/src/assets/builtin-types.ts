import { QNameToString, type QName } from "server/analysis/names.js";
import { type WrapperResolvedQName, toResolvedQName } from "server/wrapper/names.js";

import { loadJsonAsset } from "./loader.js";

export interface BuiltinTypeDefinition {
    name: QName;
    isBuiltin: true;
}

function findBuiltinTypeDefinition(
    map: Map<string, BuiltinTypeDefinition>,
    name: QName,
): BuiltinTypeDefinition | undefined {
    return map.get(QNameToString(name, true));
}

const map = new Map<string, BuiltinTypeDefinition>();
const catalog =
    loadJsonAsset<
        Array<{
            name: WrapperResolvedQName;
        }>
    >("builtin-types.json") || [];

for (const builtinType of catalog) {
    const name = toResolvedQName(builtinType.name);

    map.set(QNameToString(name, true), {
        name,
        isBuiltin: true,
    });
}

export const builtinTypes = {
    all: [...map.values()],
    find: (name: QName) => findBuiltinTypeDefinition(map, name),
};

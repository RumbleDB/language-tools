import {
    DEFAULT_TYPE_NAMESPACE,
    JS_NAMESPACE,
    XS_NAMESPACE,
} from "server/analysis/model/constants.js";
import type { BuiltinTypeDefinition } from "server/analysis/model/definitions.js";
import { QNameToString, type QName } from "server/analysis/model/names.js";

import { loadJsonAsset } from "./loader.js";

export type { BuiltinTypeDefinition };

const BUILTIN_TYPE_NAMESPACES = [DEFAULT_TYPE_NAMESPACE, JS_NAMESPACE, XS_NAMESPACE] as const;

function findBuiltinTypeDefinition(
    map: Map<string, BuiltinTypeDefinition>,
    name: QName,
): BuiltinTypeDefinition | undefined {
    const direct = map.get(QNameToString(name, true));
    if (direct !== undefined) {
        return direct;
    }

    if (name.namespaceUri !== undefined || name.prefix !== undefined) {
        return undefined;
    }

    for (const namespaceUri of BUILTIN_TYPE_NAMESPACES) {
        const candidate = map.get(
            QNameToString(
                {
                    localName: name.localName,
                    namespaceUri,
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

const map = new Map<string, BuiltinTypeDefinition>();
const catalog =
    loadJsonAsset<
        Array<{
            name: QName;
        }>
    >("builtin-types.json") || [];

for (const builtinType of catalog) {
    const name = builtinType.name;

    const definition: BuiltinTypeDefinition = {
        name,
        kind: "type",
        origin: "builtin",
    };
    map.set(QNameToString(name, true), definition);
}

export const builtinTypes = {
    all: [...map.values()],
    find: (name: QName) => findBuiltinTypeDefinition(map, name),
};

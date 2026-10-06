import type {
    ObjectFieldDefinition,
    SequenceType,
    TypeDefinition,
} from "server/types/type-system.js";

import { DEFAULT_TYPE_NAMESPACE } from "./constants.js";
import { QNameToString, type FunctionName } from "./names.js";

export type {
    ArrayTypeDefinition,
    NamedTypeDefinition,
    ObjectFieldDefinition,
    ObjectTypeDefinition,
    OpaqueTypeDefinition,
    SequenceType,
    TypeDefinition,
    UnionTypeDefinition,
} from "server/types/type-system.js";

export interface StaticFunctionParameter {
    name?: FunctionName;
    type: SequenceType;
}

export interface StaticFunctionSignature {
    parameterTypes: StaticFunctionParameter[];
    returnType: SequenceType;
}

export function formatTypeDefinition(type: TypeDefinition): string {
    switch (type.kind) {
        case "named":
            if (
                type.name.namespaceUri === DEFAULT_TYPE_NAMESPACE &&
                type.name.localName === "map"
            ) {
                return "map(*)";
            }
            return QNameToString(type.name, false);
        case "opaque":
            return type.displayName;
        case "union":
            return `(${type.members.map(formatTypeDefinition).join(" | ")})`;
        case "object": {
            if (Object.keys(type.fields).length === 0 && type.name !== undefined) {
                return QNameToString(type.name, false);
            }
            const fields = Object.entries(type.fields)
                .map(([name, field]) => `${name}${formatObjectField(field)}`)
                .join(", ");
            return `{ ${fields} }`;
        }
        case "array":
            if (type.name !== undefined) return QNameToString(type.name, false);
            return type.content === undefined
                ? (type.displayName ?? "anonymous type")
                : `[${formatTypeDefinition(type.content)}]`;
        default:
            throw type satisfies never;
    }
}

/** Formats a field after its name, e.g. `?: xs:string` for an optional field. */
export function formatObjectField(field: ObjectFieldDefinition): string {
    return `${field.required ? "" : "?"}: ${formatTypeDefinition(field.type)}`;
}

export function formatSequenceType(type: SequenceType): string {
    return `${formatTypeDefinition(type.itemType)}${type.arity}`;
}

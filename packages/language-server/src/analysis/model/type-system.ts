import type { SequenceType, TypeDefinition } from "server/types/type-system.js";

import { QNameToString, type FunctionName } from "./names.js";

export type {
    ArrayTypeDefinition,
    NamedTypeDefinition,
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
            return QNameToString(type.name, false);
        case "opaque":
            return type.displayName;
        case "union":
            return `(${type.members.map(formatTypeDefinition).join(" | ")})`;
        case "object": {
            const fields = Object.entries(type.fields)
                .map(([name, fieldType]) => `${name}: ${formatTypeDefinition(fieldType)}`)
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

export function formatSequenceType(type: SequenceType): string {
    return `${formatTypeDefinition(type.itemType)}${type.arity}`;
}

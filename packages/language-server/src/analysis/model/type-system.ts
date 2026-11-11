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

/** Widest nested type that a summary still spells out in full. */
const SUMMARY_WIDTH = 60;

/** Widest type that the expanded format keeps on one line. */
const SINGLE_LINE_WIDTH = 80;

/**
 * Formats a type on one line that stays readable for a large type, such as the schema of a Parquet file: an object
 * that does not fit in `maxWidth` shows only how many fields it has.
 */
export function summarizeTypeDefinition(type: TypeDefinition, maxWidth = SUMMARY_WIDTH): string {
    const full = formatTypeDefinition(type);
    if (full.length <= maxWidth) {
        return full;
    }
    switch (type.kind) {
        case "object": {
            const count = Object.keys(type.fields).length;
            return `{ … ${count} ${count === 1 ? "field" : "fields"} }`;
        }
        case "array":
            return type.content === undefined || type.name !== undefined
                ? full
                : `[${summarizeTypeDefinition(type.content, maxWidth)}]`;
        case "union":
            return `(${type.members.map((member) => summarizeTypeDefinition(member, maxWidth)).join(" | ")})`;
        default:
            return full;
    }
}

/** Formats a field after its name like {@link formatObjectField}, with its type summarized. */
export function summarizeObjectField(field: ObjectFieldDefinition): string {
    return `${field.required ? "" : "?"}: ${summarizeTypeDefinition(field.type)}`;
}

export function summarizeSequenceType(type: SequenceType, maxWidth = SUMMARY_WIDTH): string {
    return `${summarizeTypeDefinition(type.itemType, maxWidth)}${type.arity}`;
}

/**
 * Formats a type that is too wide for one line with one field per line. The fields are summarized, so the result
 * grows with the number of fields of the type and not with what is nested in them.
 */
export function formatTypeDefinitionExpanded(type: TypeDefinition): string {
    if (formatTypeDefinition(type).length <= SINGLE_LINE_WIDTH) {
        return formatTypeDefinition(type);
    }
    switch (type.kind) {
        case "object": {
            const fields = Object.entries(type.fields).map(
                ([name, field]) => `  ${name}${summarizeObjectField(field)}`,
            );
            return `{\n${fields.join(",\n")}\n}`;
        }
        case "array":
            return type.content === undefined || type.name !== undefined
                ? formatTypeDefinition(type)
                : `[${formatTypeDefinitionExpanded(type.content)}]`;
        case "union":
            return `(${type.members.map(formatTypeDefinitionExpanded).join(" | ")})`;
        default:
            return formatTypeDefinition(type);
    }
}

export function formatSequenceTypeExpanded(type: SequenceType): string {
    return `${formatTypeDefinitionExpanded(type.itemType)}${type.arity}`;
}

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

/** How much of a type a one-line rendering spells out. */
interface RenderLimits {
    /** Objects nested deeper than this many levels are shown as `{…}`. */
    readonly depth: number;
    /** Shows only the names of the fields of the outermost objects, not their types. */
    readonly namesOnly: boolean;
    /** Fields shown per object; the others are counted as `… N more`. */
    readonly maxFields: number;
}

const UNLIMITED: RenderLimits = { depth: Infinity, namesOnly: false, maxFields: Infinity };

export function formatTypeDefinition(type: TypeDefinition): string {
    return renderType(type, UNLIMITED);
}

function renderType(type: TypeDefinition, limits: RenderLimits): string {
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
            return `(${type.members.map((member) => renderType(member, limits)).join(" | ")})`;
        case "object": {
            const entries = Object.entries(type.fields);
            if (entries.length === 0 && type.name !== undefined) {
                return QNameToString(type.name, false);
            }
            if (entries.length > 0 && limits.depth <= 0) {
                return "{…}";
            }
            const nested = { ...limits, depth: limits.depth - 1 };
            const fields = entries
                .slice(0, limits.maxFields)
                .map(([name, field]) =>
                    limits.namesOnly
                        ? fieldName(name, field)
                        : `${fieldName(name, field)}: ${renderType(field.type, nested)}`,
                );
            const hidden = entries.length - fields.length;
            if (hidden > 0) {
                fields.push(fields.length === 0 ? `… ${pluralFields(hidden)}` : `… ${hidden} more`);
            }
            return `{ ${fields.join(", ")} }`;
        }
        case "array":
            if (type.name !== undefined) return QNameToString(type.name, false);
            return type.content === undefined
                ? (type.displayName ?? "anonymous type")
                : `[${renderType(type.content, limits)}]`;
        default:
            throw type satisfies never;
    }
}

/** A field name followed by `?` when the field is optional. */
function fieldName(name: string, field: ObjectFieldDefinition): string {
    return `${name}${field.required ? "" : "?"}`;
}

function pluralFields(count: number): string {
    return `${count} ${count === 1 ? "field" : "fields"}`;
}

/** Formats a field after its name, e.g. `?: xs:string` for an optional field. */
export function formatObjectField(field: ObjectFieldDefinition): string {
    return `${field.required ? "" : "?"}: ${formatTypeDefinition(field.type)}`;
}

export function formatSequenceType(type: SequenceType): string {
    return `${formatTypeDefinition(type.itemType)}${type.arity}`;
}

/** How many levels of objects a type nests, e.g. 2 for `[{ a: { b: xs:string } }]`. */
function objectDepth(type: TypeDefinition): number {
    switch (type.kind) {
        case "object":
            return (
                1 +
                Math.max(0, ...Object.values(type.fields).map((field) => objectDepth(field.type)))
            );
        case "array":
            return type.content === undefined ? 0 : objectDepth(type.content);
        case "union":
            return Math.max(0, ...type.members.map(objectDepth));
        default:
            return 0;
    }
}

/** The most fields of any outermost object of a type, which are the fields that a summary drops. */
function outerFieldCount(type: TypeDefinition): number {
    switch (type.kind) {
        case "object":
            return Object.keys(type.fields).length;
        case "array":
            return type.content === undefined ? 0 : outerFieldCount(type.content);
        case "union":
            return Math.max(0, ...type.members.map(outerFieldCount));
        default:
            return 0;
    }
}

/** Width of a summary in completion details, where little more than this is visible. */
const SUMMARY_WIDTH = 60;

/**
 * Formats a type on one line of at most `maxWidth` characters when it can, giving up detail from the inside out: first
 * nested objects become `{…}`, then the outermost objects show only their field names, then only the first of them.
 * A type with nothing to give up, such as a long named type, is returned in full.
 */
export function summarizeTypeDefinition(type: TypeDefinition, maxWidth = SUMMARY_WIDTH): string {
    // Collapse nested objects one level at a time, starting from the whole type.
    for (let depth = objectDepth(type); depth >= 1; depth--) {
        const summary = renderType(type, { ...UNLIMITED, depth });
        if (summary.length <= maxWidth) {
            return summary;
        }
    }
    // Show as many field names as fit. Without fields to drop, the type is returned in full.
    const names = (maxFields: number): string =>
        renderType(type, { depth: 1, namesOnly: true, maxFields });
    const fieldCount = outerFieldCount(type);
    let shown = 0;
    while (shown < fieldCount && names(shown + 1).length <= maxWidth) {
        shown++;
    }
    return names(shown);
}

/** Formats a field after its name like {@link formatObjectField}, with its type summarized. */
export function summarizeObjectField(
    field: ObjectFieldDefinition,
    maxWidth = SUMMARY_WIDTH,
): string {
    const optional = field.required ? "" : "?";
    return `${optional}: ${summarizeTypeDefinition(field.type, maxWidth - optional.length - 2)}`;
}

export function summarizeSequenceType(type: SequenceType, maxWidth = SUMMARY_WIDTH): string {
    return `${summarizeTypeDefinition(type.itemType, maxWidth - type.arity.length)}${type.arity}`;
}

/** Width of a hover line. */
const EXPANDED_WIDTH = 80;

/** Fields a hover lists before it counts the others. */
const EXPANDED_FIELDS = 20;

/**
 * Formats a type that is too wide for one line with one field per line, each field's type summarized on its line.
 * Only one level is expanded: what is nested deeper shows when hovering that field in a path.
 */
export function formatTypeDefinitionExpanded(
    type: TypeDefinition,
    available = EXPANDED_WIDTH,
): string {
    const inline = formatTypeDefinition(type);
    if (inline.length <= available) {
        return inline;
    }
    switch (type.kind) {
        case "object": {
            const entries = Object.entries(type.fields);
            const fields = entries.slice(0, EXPANDED_FIELDS).map(([name, field]) => {
                const prefix = `  ${fieldName(name, field)}: `;
                // Leave room for the comma after the field.
                const width = EXPANDED_WIDTH - prefix.length - 1;
                return `${prefix}${summarizeTypeDefinition(field.type, width)}`;
            });
            const hidden = entries.length - fields.length;
            if (hidden > 0) {
                fields.push(`  … ${hidden} more ${hidden === 1 ? "field" : "fields"}`);
            }
            return `{\n${fields.join(",\n")}\n}`;
        }
        case "array":
            return type.content === undefined || type.name !== undefined
                ? inline
                : `[${formatTypeDefinitionExpanded(type.content, available - 2)}]`;
        case "union":
            return `(${type.members
                .map((member) => formatTypeDefinitionExpanded(member, available - 2))
                .join(" | ")})`;
        default:
            return inline;
    }
}

export function formatSequenceTypeExpanded(type: SequenceType): string {
    const itemType = formatTypeDefinitionExpanded(
        type.itemType,
        EXPANDED_WIDTH - type.arity.length,
    );
    return `${itemType}${type.arity}`;
}

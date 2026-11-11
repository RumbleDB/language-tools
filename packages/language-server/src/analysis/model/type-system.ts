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
                        ? `${name}${field.required ? "" : "?"}`
                        : `${name}${field.required ? "" : "?"}: ${renderType(field.type, nested)}`,
                );
            const hidden = entries.length - fields.length;
            if (hidden > 0) {
                fields.push(fields.length === 0 ? countFields(hidden) : `… ${hidden} more`);
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

function countFields(count: number): string {
    return `… ${count} ${count === 1 ? "field" : "fields"}`;
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

/** The most fields of any outermost object of a type, which is where a summary drops fields. */
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
    const full = formatTypeDefinition(type);
    if (full.length <= maxWidth) {
        return full;
    }
    const depth = objectDepth(type);
    if (depth === 0) {
        return full;
    }
    for (let nested = depth - 1; nested >= 1; nested--) {
        const summary = renderType(type, { ...UNLIMITED, depth: nested });
        if (summary.length <= maxWidth) {
            return summary;
        }
    }
    const names = (maxFields: number): string =>
        renderType(type, { depth: 1, namesOnly: true, maxFields });
    const fieldCount = outerFieldCount(type);
    const allNames = names(fieldCount);
    if (allNames.length <= maxWidth) {
        return allNames;
    }
    // Showing one more name never makes a summary shorter while some names stay hidden.
    let fits = 0;
    let tooWide = fieldCount;
    while (tooWide - fits > 1) {
        const middle = Math.floor((fits + tooWide) / 2);
        if (names(middle).length <= maxWidth) {
            fits = middle;
        } else {
            tooWide = middle;
        }
    }
    return names(fits);
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

/** Lines a hover may take before nested objects are summarized and then fields are left out. */
const EXPANDED_LINES = 40;

/**
 * Formats a type that is too wide for one line with one field per line, indenting nested objects. Objects are expanded
 * as deep as the result stays within {@link EXPANDED_LINES} lines, and what is nested deeper is summarized on one line.
 * An object with too many fields for that shows only the first of them.
 */
export function formatTypeDefinitionExpanded(type: TypeDefinition, suffix = ""): string {
    const available = EXPANDED_WIDTH - suffix.length;
    for (let depth = objectDepth(type); depth >= 1; depth--) {
        const expanded = expandType(type, depth, 0, available, Infinity);
        if (lineCount(expanded) <= EXPANDED_LINES) {
            return expanded;
        }
    }
    return expandType(type, 1, 0, available, EXPANDED_LINES - 3);
}

export function formatSequenceTypeExpanded(type: SequenceType): string {
    return `${formatTypeDefinitionExpanded(type.itemType, type.arity)}${type.arity}`;
}

function lineCount(text: string): number {
    return text.split("\n").length;
}

/**
 * Formats a type whose first line continues a line that leaves `available` characters, and whose other lines are
 * indented by `indent`.
 */
function expandType(
    type: TypeDefinition,
    depth: number,
    indent: number,
    available: number,
    maxFields: number,
): string {
    const inline = formatTypeDefinition(type);
    if (inline.length <= available) {
        return inline;
    }
    if (depth <= 0) {
        return summarizeTypeDefinition(type, available);
    }
    switch (type.kind) {
        case "object": {
            const entries = Object.entries(type.fields);
            if (entries.length === 0) {
                return inline;
            }
            const padding = " ".repeat(indent + 2);
            const fields = entries.slice(0, maxFields).map(([name, field]) => {
                const prefix = `${name}${field.required ? "" : "?"}: `;
                // Leave room for the comma after the field.
                const width = EXPANDED_WIDTH - indent - 2 - prefix.length - 1;
                return `${padding}${prefix}${expandType(field.type, depth - 1, indent + 2, width, maxFields)}`;
            });
            const hidden = entries.length - fields.length;
            if (hidden > 0) {
                fields.push(`${padding}… ${hidden} more ${hidden === 1 ? "field" : "fields"}`);
            }
            return `{\n${fields.join(",\n")}\n${" ".repeat(indent)}}`;
        }
        case "array":
            return type.content === undefined || type.name !== undefined
                ? inline
                : `[${expandType(type.content, depth, indent, available - 2, maxFields)}]`;
        case "union":
            return `(${type.members
                .map((member) => expandType(member, depth, indent, available - 2, maxFields))
                .join(" | ")})`;
        default:
            return inline;
    }
}

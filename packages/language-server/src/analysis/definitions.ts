import { BuiltinFunctionDefinition } from "server/wrapper/builtin-functions.js";
import type { Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    functionNameToString,
    QNameToString,
    type DeclarationNameByKind,
    type FunctionName,
    type QName,
} from "./names.js";
import { ResolvedReference } from "./reference.js";

export type VariableKind =
    | "declare-variable"
    | "let"
    | "for"
    | "for-position"
    | "group-by"
    | "count"
    | "catch-variable";

export type DeclarationKind = VariableKind | "namespace" | "type" | "parameter" | "function";

export type DefinitionKind = DeclarationKind | "builtin-function";

export type DefinitionNameByKind = DeclarationNameByKind & {
    "builtin-function": FunctionName;
};

interface AbstractDefinition<K extends DefinitionKind> {
    name: DefinitionNameByKind[K];
    kind: K;

    // List of references that resolve to this declaration.
    references: ResolvedReference[];

    isBuiltin: boolean;
}

export type BaseDefinition<K extends DefinitionKind = DefinitionKind> = K extends DefinitionKind
    ? AbstractDefinition<K>
    : never;

export interface BaseSourceDefinition<
    K extends DeclarationKind = DeclarationKind,
> extends AbstractDefinition<K> {
    // Entire range of the declaration.
    range: Range;

    // Range of the declaration name token.
    selectionRange: Range;

    // Offset from which the declaration is visible to position-based queries.
    visibleFrom: number;

    isBuiltin: false;
}

export interface SourceVariableDefinition extends BaseSourceDefinition<VariableKind> {
    kind: VariableKind;
}

export interface SourceParameterDefinition extends BaseSourceDefinition<"parameter"> {
    kind: "parameter";
    function: SourceFunctionDefinition;
}

export interface SourceFunctionDefinition extends BaseSourceDefinition<"function"> {
    kind: "function";
    parameters: SourceParameterDefinition[];
}

export interface SourceNamespaceDefinition extends BaseSourceDefinition<"namespace"> {
    kind: "namespace";
    namespaceUri: string;
}

export type SourceDefinition =
    | SourceVariableDefinition
    | SourceParameterDefinition
    | SourceFunctionDefinition
    | SourceNamespaceDefinition
    | BaseSourceDefinition<"type">;

export type Definition = SourceDefinition | BuiltinFunctionDefinition;

export function isSourceDefinition(
    declaration: BaseDefinition | undefined,
): declaration is SourceDefinition {
    return declaration !== undefined && declaration.isBuiltin === false;
}

export function isSourceVariableDefinition(
    declaration: BaseDefinition | undefined,
): declaration is SourceVariableDefinition {
    return [
        "declare-variable",
        "let",
        "for",
        "for-position",
        "group-by",
        "count",
        "catch-variable",
    ].includes(declaration?.kind ?? "");
}

export function isSourceParameterDefinition(
    declaration: BaseDefinition | undefined,
): declaration is SourceParameterDefinition {
    return isSourceDefinition(declaration) && declaration.kind === "parameter";
}

export function isSourceFunctionDefinition(
    declaration: BaseDefinition | undefined,
): declaration is SourceFunctionDefinition {
    return isSourceDefinition(declaration) && declaration.kind === "function";
}

export function definitionNameToString(definition: BaseDefinition): string {
    switch (definition.kind) {
        case "namespace":
            return definition.name.prefix;
        case "function":
        case "builtin-function":
            return functionNameToString(definition.name);
        case "type":
            return QNameToString(definition.name);
        case "parameter":
        case "declare-variable":
        case "let":
        case "for":
        case "for-position":
        case "group-by":
        case "count":
        case "catch-variable":
            return QNameToString(definition.name);
        default:
            throw definition satisfies never;
    }
}

interface DefinitionBaseInput {
    range: Range;
    selectionRange: Range;
    visibleFrom?: number;
}

function createBaseDefinition(document: TextDocument, input: DefinitionBaseInput) {
    return {
        range: input.range,
        selectionRange: input.selectionRange,
        visibleFrom: input.visibleFrom ?? document.offsetAt(input.range.end),
        references: [],
        isBuiltin: false as const,
    };
}

export function createVariableDefinition(
    document: TextDocument,
    kind: VariableKind,
    name: QName,
    range: Range,
    selectionRange: Range,
    visibleFrom?: number,
): SourceVariableDefinition {
    return {
        ...createBaseDefinition(document, {
            range,
            selectionRange,
            ...(visibleFrom === undefined ? {} : { visibleFrom }),
        }),
        kind,
        name,
    };
}

export function createFunctionDefinition(
    document: TextDocument,
    name: FunctionName,
    range: Range,
    selectionRange: Range,
): SourceFunctionDefinition {
    return {
        ...createBaseDefinition(document, {
            range,
            selectionRange,
            visibleFrom: document.offsetAt(selectionRange.end),
        }),
        kind: "function",
        name,
        parameters: [],
    };
}

export function createParameterDefinition(
    document: TextDocument,
    name: QName,
    range: Range,
    selectionRange: Range,
    containingFunction: SourceFunctionDefinition,
): SourceParameterDefinition {
    return {
        ...createBaseDefinition(document, { range, selectionRange }),
        kind: "parameter",
        name,
        function: containingFunction,
    };
}

export function createNamespaceDefinition(
    document: TextDocument,
    prefix: string,
    namespaceUri: string,
    range: Range,
    selectionRange: Range,
): SourceNamespaceDefinition {
    return {
        ...createBaseDefinition(document, { range, selectionRange }),
        kind: "namespace",
        name: { prefix },
        namespaceUri,
    };
}

export function createTypeDefinition(
    document: TextDocument,
    name: QName,
    range: Range,
    selectionRange: Range,
): Extract<SourceDefinition, { kind: "type" }> {
    return {
        ...createBaseDefinition(document, { range, selectionRange }),
        kind: "type" satisfies DeclarationKind,
        name,
    };
}

import { BuiltinFunctionDefinition } from "server/assets/builtin-functions.js";
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

export type DeclarationKind = "variable" | "namespace" | "type" | "parameter" | "function";

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
    /** URI of the module that owns this declaration. */
    uri: string;
    // Entire range of the declaration.
    range: Range;

    // Range of the declaration name token.
    selectionRange: Range;

    // Offset from which the declaration is visible to position-based queries.
    visibleFrom: number;

    isBuiltin: false;
}

export interface SourceVariableDefinition extends BaseSourceDefinition<"variable"> {
    kind: "variable";
    isPrivate: boolean;
}

export interface SourceParameterDefinition extends BaseSourceDefinition<"parameter"> {
    kind: "parameter";
    function: SourceFunctionDefinition;
}

export interface SourceFunctionDefinition extends BaseSourceDefinition<"function"> {
    kind: "function";
    parameters: SourceParameterDefinition[];
    isPrivate: boolean;
}

export type SourceModuleExportDefinition = SourceVariableDefinition | SourceFunctionDefinition;

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
    return isSourceDefinition(declaration) && declaration.kind === "variable";
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

export function isSourceTypeDefinition(
    declaration: BaseDefinition | undefined,
): declaration is Extract<SourceDefinition, { kind: "type" }> {
    return isSourceDefinition(declaration) && declaration.kind === "type";
}

export function definitionNameToString(
    definition: BaseDefinition,
    expanded: boolean = false,
): string {
    switch (definition.kind) {
        case "namespace":
            return definition.name.prefix;
        case "function":
        case "builtin-function":
            return functionNameToString(definition.name, expanded);
        case "type":
            return QNameToString(definition.name, expanded);
        case "parameter":
        case "variable":
            return `$${QNameToString(definition.name, expanded)}`;
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
        uri: document.uri,
        range: input.range,
        selectionRange: input.selectionRange,
        visibleFrom: input.visibleFrom ?? document.offsetAt(input.range.end),
        references: [],
        isBuiltin: false as const,
    };
}

export function createVariableDefinition(
    document: TextDocument,
    name: QName,
    range: Range,
    selectionRange: Range,
    visibleFrom?: number,
    isPrivate: boolean = false,
): SourceVariableDefinition {
    return {
        ...createBaseDefinition(document, {
            range,
            selectionRange,
            ...(visibleFrom === undefined ? {} : { visibleFrom }),
        }),
        kind: "variable",
        name,
        isPrivate,
    };
}

export function createFunctionDefinition(
    document: TextDocument,
    name: FunctionName,
    range: Range,
    selectionRange: Range,
    isPrivate: boolean = false,
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
        isPrivate,
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

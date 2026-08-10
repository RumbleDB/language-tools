import type { BuiltinFunctionDefinition } from "server/assets/builtin-functions.js";
import type { Range } from "vscode-languageserver";

import {
    functionNameToString,
    QNameToString,
    type DeclarationNameByKind,
    type FunctionName,
} from "./names.js";
export type DeclarationKind = "variable" | "namespace" | "type" | "parameter" | "function";

export type DefinitionKind = DeclarationKind | "builtin-function";

export type DefinitionOrigin = "source" | "implicit" | "builtin";

export type DefinitionNameByKind = DeclarationNameByKind & {
    "builtin-function": FunctionName;
};

interface AbstractDefinition<K extends DefinitionKind> {
    name: DefinitionNameByKind[K];
    kind: K;
    origin: DefinitionOrigin;
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

    origin: "source";
}

export interface SourceVariableDefinition extends BaseSourceDefinition<"variable"> {
    kind: "variable";
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

export interface SourceTypeDefinition extends BaseSourceDefinition<"type"> {
    kind: "type";
}

export type SourceDefinition =
    | SourceVariableDefinition
    | SourceParameterDefinition
    | SourceFunctionDefinition
    | SourceNamespaceDefinition
    | SourceTypeDefinition;

export interface ImplicitVariableDefinition extends AbstractDefinition<"variable"> {
    kind: "variable";
    origin: "implicit";

    // Offset from which the binding is visible to position-based queries.
    visibleFrom: number;
}

export interface ImplicitNamespaceDefinition extends AbstractDefinition<"namespace"> {
    kind: "namespace";
    origin: "implicit";
    namespaceUri: string;
}

export type NamespaceDefinition = SourceNamespaceDefinition | ImplicitNamespaceDefinition;

export type ScopeDefinition = SourceDefinition | ImplicitVariableDefinition;

export type VariableDefinition =
    | SourceVariableDefinition
    | SourceParameterDefinition
    | ImplicitVariableDefinition;

export interface ScopeDefinitionByReferenceKind {
    variable: VariableDefinition;
    function: SourceFunctionDefinition;
    type: SourceTypeDefinition;
}

export interface DefinitionByReferenceKind {
    variable: VariableDefinition;
    function: SourceFunctionDefinition | BuiltinFunctionDefinition;
    type: SourceTypeDefinition;
}

export type Definition = ScopeDefinition | ImplicitNamespaceDefinition | BuiltinFunctionDefinition;

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

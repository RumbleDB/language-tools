import type { BuiltinFunctionDefinition } from "server/assets/builtin-functions.js";
import type { Range } from "vscode-languageserver";

import { functionNameToString, QNameToString, type DeclarationNameByKind } from "./names.js";

export type DefinitionKind = "variable" | "namespace" | "type" | "parameter" | "function";

export type DefinitionOrigin = "source" | "implicit" | "builtin";

declare const symbolIdBrand: unique symbol;
export type SymbolId = string & { readonly [symbolIdBrand]: true };

interface AbstractDefinition<K extends DefinitionKind> {
    readonly name: DeclarationNameByKind[K];
    readonly kind: K;
    readonly origin: DefinitionOrigin;
}

export type BaseDefinition<K extends DefinitionKind = DefinitionKind> = K extends DefinitionKind
    ? AbstractDefinition<K>
    : never;

export interface BaseSourceDefinition<
    K extends DefinitionKind = DefinitionKind,
> extends AbstractDefinition<K> {
    readonly id: SymbolId;
    /** URI of the module that owns this declaration. */
    readonly uri: string;
    // Entire range of the declaration.
    readonly range: Range;

    // Range of the declaration name token.
    readonly selectionRange: Range;

    readonly origin: "source";
}

export interface SourceVariableDefinition extends BaseSourceDefinition<"variable"> {
    readonly kind: "variable";
}

export interface SourceParameterDefinition extends BaseSourceDefinition<"parameter"> {
    readonly kind: "parameter";
    readonly function: SourceFunctionDefinition;
}

export interface SourceFunctionDefinition extends BaseSourceDefinition<"function"> {
    readonly kind: "function";
    readonly parameters: readonly SourceParameterDefinition[];
}

export type SourceModuleExportDefinition = SourceVariableDefinition | SourceFunctionDefinition;

export interface SourceNamespaceDefinition extends BaseSourceDefinition<"namespace"> {
    readonly kind: "namespace";
    readonly namespaceUri: string;
}

export interface SourceTypeDefinition extends BaseSourceDefinition<"type"> {
    readonly kind: "type";
}

export type SourceDefinition =
    | SourceVariableDefinition
    | SourceParameterDefinition
    | SourceFunctionDefinition
    | SourceNamespaceDefinition
    | SourceTypeDefinition;

export interface ImplicitVariableDefinition extends AbstractDefinition<"variable"> {
    readonly kind: "variable";
    readonly origin: "implicit";
}

export interface ImplicitNamespaceDefinition extends AbstractDefinition<"namespace"> {
    readonly kind: "namespace";
    readonly origin: "implicit";
    readonly namespaceUri: string;
}

export type NamespaceDefinition = SourceNamespaceDefinition | ImplicitNamespaceDefinition;

export type ScopeDefinition =
    | SourceVariableDefinition
    | SourceParameterDefinition
    | SourceFunctionDefinition
    | SourceTypeDefinition
    | ImplicitVariableDefinition;

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

export type Definition =
    | SourceDefinition
    | ImplicitVariableDefinition
    | ImplicitNamespaceDefinition
    | BuiltinFunctionDefinition;

export function definitionNameToString(
    definition: BaseDefinition,
    expanded: boolean = false,
): string {
    switch (definition.kind) {
        case "namespace":
            return definition.name.prefix;
        case "function":
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

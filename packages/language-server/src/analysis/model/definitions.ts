import type { Range } from "vscode-languageserver";

import type { FunctionName, QName } from "./names.js";
import { functionNameToString, QNameToString, type DeclarationNameByKind } from "./names.js";
import type { StaticFunctionSignature } from "./type-system.js";

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

export interface BuiltinFunctionDefinition extends BaseDefinition<"function"> {
    readonly name: FunctionName;
    readonly kind: "function";
    readonly signature: StaticFunctionSignature;
    readonly origin: "builtin";
}

export interface BuiltinTypeDefinition extends BaseDefinition<"type"> {
    readonly name: QName;
    readonly kind: "type";
    readonly origin: "builtin";
}

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

/** A declaration made visible by importing a RumbleDB library module. */
export type SourceModuleExportDefinition =
    | SourceVariableDefinition
    | SourceFunctionDefinition
    | SourceTypeDefinition;

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

export interface BuiltinDefinitionByReferenceKind {
    variable: never;
    function: BuiltinFunctionDefinition;
    type: BuiltinTypeDefinition;
}

export interface DefinitionByReferenceKind {
    variable: VariableDefinition;
    function: SourceFunctionDefinition | BuiltinFunctionDefinition;
    type: SourceTypeDefinition | BuiltinTypeDefinition;
}

export type Definition =
    | SourceDefinition
    | ImplicitVariableDefinition
    | BuiltinFunctionDefinition
    | BuiltinTypeDefinition;

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

export function duplicateSymbolErrorCode(kind: DefinitionKind): string {
    switch (kind) {
        case "variable":
        case "parameter":
            return "XQST0049";
        case "function":
            return "XQST0034";
        case "type":
            return "duplicate-type";
        case "namespace":
            return "XQST0033";
        default:
            throw kind satisfies never;
    }
}

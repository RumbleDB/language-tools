import { BuiltinFunctionDefinition } from "server/assets/builtin-functions.js";
import type { Range } from "vscode-languageserver";

import {
    functionNameToString,
    QNameToString,
    type DeclarationNameByKind,
    type FunctionName,
} from "./names.js";
import { ResolvedReference } from "./reference.js";

export type DeclarationKind = "variable" | "namespace" | "type" | "parameter" | "function";

export type DefinitionKind = DeclarationKind | "builtin-function";

export type DefinitionOrigin = "source" | "implicit" | "builtin";

export type DefinitionNameByKind = DeclarationNameByKind & {
    "builtin-function": FunctionName;
};

interface AbstractDefinition<K extends DefinitionKind> {
    name: DefinitionNameByKind[K];
    kind: K;

    // List of references that resolve to this declaration.
    references: ResolvedReference[];

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

export type SourceDefinition =
    | SourceVariableDefinition
    | SourceParameterDefinition
    | SourceFunctionDefinition
    | SourceNamespaceDefinition
    | BaseSourceDefinition<"type">;

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

export type ScopedDefinition = SourceDefinition | ImplicitVariableDefinition;

export type Definition = ScopedDefinition | ImplicitNamespaceDefinition | BuiltinFunctionDefinition;

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

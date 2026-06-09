import type { JsoniqAst } from "server/parser/types/ast.js";
import { Prefix } from "server/parser/types/name.js";
import type { BuiltinFunctionDefinition } from "server/wrapper/builtin-functions.js";
import type { Diagnostic, Range } from "vscode-languageserver";

import {
    type ResolvedDeclarationNameByKind,
    type ResolvedFunctionName,
    type ResolvedReferenceNameByKind,
    resolvedFunctionNameToString,
    resolvedQNameToString,
    resolvedVarNameToString,
} from "./names.js";
import type { Scope } from "./scope.js";

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

export type DefinitionNameByKind = ResolvedDeclarationNameByKind & {
    "builtin-function": ResolvedFunctionName;
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

export interface Reference<K extends keyof ResolvedReferenceNameByKind> {
    name: ResolvedReferenceNameByKind[K];
    kind: K;
    range: Range;
}

export type AnyReference<
    K extends keyof ResolvedReferenceNameByKind = keyof ResolvedReferenceNameByKind,
> = K extends keyof ResolvedReferenceNameByKind ? Reference<K> : never;

export type ResolvedReference<
    K extends keyof ResolvedReferenceNameByKind = keyof ResolvedReferenceNameByKind,
> = AnyReference<K> & { declaration: Definition };

export interface SymbolIndexEntry {
    range: Range;
    declaration: Definition;

    // The reference corresponding to this occurrence, if it is a reference.
    reference: ResolvedReference | undefined;
}

export interface JsoniqAnalysis {
    ast: JsoniqAst;

    moduleScope: Scope;

    // Namespace declarations are module-level only and do not participate in lexical scope.
    namespaces: Map<Prefix, SourceNamespaceDefinition>;

    // All declarations, sorted by declaration position.
    definitions: SourceDefinition[];

    // All resolved references in traversal order.
    references: ResolvedReference[];

    diagnostics: Diagnostic[];

    // Declarations and references, sorted by source position.
    symbolIndex: SymbolIndexEntry[];
}

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
            return resolvedFunctionNameToString(definition.name);
        case "type":
            return resolvedQNameToString(definition.name.qname);
        case "parameter":
        case "declare-variable":
        case "let":
        case "for":
        case "for-position":
        case "group-by":
        case "count":
        case "catch-variable":
            return resolvedVarNameToString(definition.name);
        default:
            throw definition satisfies never;
    }
}

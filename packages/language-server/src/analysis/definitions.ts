import type { Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type {
    DeclarationKind,
    SourceDefinition,
    SourceFunctionDefinition,
    SourceNamespaceDefinition,
    SourceParameterDefinition,
    SourceVariableDefinition,
    VariableKind,
} from "./model.js";
import type { ResolvedFunctionName, ResolvedQName, ResolvedVarName } from "./names.js";

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
    name: ResolvedVarName,
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
    name: ResolvedFunctionName,
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
    name: ResolvedVarName,
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
    name: { qname: ResolvedQName },
    range: Range,
    selectionRange: Range,
): Extract<SourceDefinition, { kind: "type" }> {
    return {
        ...createBaseDefinition(document, { range, selectionRange }),
        kind: "type" satisfies DeclarationKind,
        name,
    };
}

import {
    type Diagnostic,
    SemanticTokensBuilder,
    type SemanticTokens,
    SemanticTokensLegend,
    SemanticTokenTypes,
    SemanticTokenModifiers,
} from "vscode-languageserver";
import { Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { DefinitionKind } from "./analysis/definitions.js";
import { collectDefinitions, collectReferences } from "./analysis/queries.js";
import { getAnalysis } from "./analysis/service.js";

export const legend: SemanticTokensLegend = {
    tokenTypes: ["function", "parameter", "variable", "namespace", "type"],
    tokenModifiers: ["definition", "defaultLibrary"],
};

export async function collectSemanticDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const analysis = await getAnalysis(document);
    return analysis.diagnostics;
}

function getTokenTypeIndex(tokenType: SemanticTokenTypes): number {
    const index = legend.tokenTypes.indexOf(tokenType);
    return index >= 0 ? index : 0;
}

function getTokenModifierMask(tokenModifier: SemanticTokenModifiers): number {
    const index = legend.tokenModifiers.indexOf(tokenModifier);
    return index >= 0 ? 1 << index : 0;
}

function addSemanticToken(
    builder: SemanticTokensBuilder,
    selectionRange: Range,
    tokenType: SemanticTokenTypes,
    tokenModifiers: SemanticTokenModifiers,
): void {
    builder.push(
        selectionRange.start.line,
        selectionRange.start.character,
        selectionRange.end.character - selectionRange.start.character,
        getTokenTypeIndex(tokenType),
        getTokenModifierMask(tokenModifiers),
    );
}

export async function collectSemanticTokens(document: TextDocument): Promise<SemanticTokens> {
    const analysis = await getAnalysis(document);
    const builder = new SemanticTokensBuilder();

    for (const definition of collectDefinitions(analysis)) {
        if (definition.kind === "catch-variable") {
            continue;
        }
        const tokenType = getTokenTypeForDefinition(definition.kind);
        const tokenModifiers = getTokenModifierForDefinition(definition.kind);
        addSemanticToken(builder, definition.selectionRange, tokenType, tokenModifiers);
    }

    for (const reference of collectReferences(analysis)) {
        const tokenType = getTokenTypeForDefinition(reference.declaration.kind);
        const tokenModifiers = getTokenModifierForDefinition(reference.declaration.kind);
        addSemanticToken(builder, reference.range, tokenType, tokenModifiers);
    }

    const result = await builder.build();
    return result;
}

function getTokenTypeForDefinition(kind: DefinitionKind): SemanticTokenTypes {
    switch (kind) {
        case "builtin-function":
        case "function":
            return SemanticTokenTypes.function;
        case "parameter":
            return SemanticTokenTypes.parameter;
        case "namespace":
            return SemanticTokenTypes.namespace;
        case "type":
            return SemanticTokenTypes.type;
        case "declare-variable":
        case "let":
        case "for":
        case "for-position":
        case "group-by":
        case "count":
        case "catch-variable":
            return SemanticTokenTypes.variable;
    }
}

function getTokenModifierForDefinition(kind: DefinitionKind): SemanticTokenModifiers {
    switch (kind) {
        case "builtin-function":
            return SemanticTokenModifiers.defaultLibrary;
        default:
            return SemanticTokenModifiers.definition;
    }
}

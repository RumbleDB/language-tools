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

import { type Definition, DefinitionKind } from "./analysis/definitions.js";
import { getResolvedReferences, getSourceDefinitions } from "./analysis/queries.js";
import { getAnalysis } from "./workspace/service.js";

export const legend: SemanticTokensLegend = {
    tokenTypes: ["function", "parameter", "variable", "namespace", "type"],
    tokenModifiers: ["definition", "defaultLibrary"],
};

export function collectSemanticDiagnostics(document: TextDocument): readonly Diagnostic[] {
    const analysis = getAnalysis(document);
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

export function collectSemanticTokens(document: TextDocument): SemanticTokens {
    const analysis = getAnalysis(document);
    const builder = new SemanticTokensBuilder();

    for (const definition of getSourceDefinitions(analysis)) {
        const tokenType = getTokenTypeForDefinition(definition.kind);
        const tokenModifiers = getTokenModifierForDefinition(definition);
        addSemanticToken(builder, definition.selectionRange, tokenType, tokenModifiers);
    }

    for (const reference of getResolvedReferences(analysis)) {
        const tokenType = getTokenTypeForDefinition(reference.declaration.kind);
        const tokenModifiers = getTokenModifierForDefinition(reference.declaration);
        addSemanticToken(builder, reference.range, tokenType, tokenModifiers);
    }

    const result = builder.build();
    return result;
}

function getTokenTypeForDefinition(kind: DefinitionKind): SemanticTokenTypes {
    switch (kind) {
        case "function":
            return SemanticTokenTypes.function;
        case "parameter":
            return SemanticTokenTypes.parameter;
        case "namespace":
            return SemanticTokenTypes.namespace;
        case "type":
            return SemanticTokenTypes.type;
        case "variable":
            return SemanticTokenTypes.variable;
    }
}

function getTokenModifierForDefinition(definition: Definition): SemanticTokenModifiers {
    return definition.origin === "builtin"
        ? SemanticTokenModifiers.defaultLibrary
        : SemanticTokenModifiers.definition;
}

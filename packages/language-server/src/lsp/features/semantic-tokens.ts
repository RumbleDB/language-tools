import { type Definition, DefinitionKind } from "server/analysis/definitions.js";
import type { WorkspaceService } from "server/workspace/service.js";
import {
    SemanticTokensBuilder,
    type SemanticTokens,
    SemanticTokensLegend,
    SemanticTokenTypes,
    SemanticTokenModifiers,
} from "vscode-languageserver";
import { Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

export function registerSemanticTokens({
    connection,
    documents,
    workspace,
}: FeatureRegistrationContext): void {
    connection.languages.semanticTokens.on((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined ? { data: [] } : collectSemanticTokens(document, workspace);
    });
}

export const legend: SemanticTokensLegend = {
    tokenTypes: ["function", "parameter", "variable", "namespace", "type"],
    tokenModifiers: ["definition", "defaultLibrary"],
};

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

export function collectSemanticTokens(
    document: TextDocument,
    workspace: WorkspaceService,
): SemanticTokens {
    const analysis = workspace.getAnalysis(document);
    const builder = new SemanticTokensBuilder();

    for (const definition of analysis.definitions) {
        const tokenType = getTokenTypeForDefinition(definition.kind);
        const tokenModifiers = getTokenModifierForDefinition(definition);
        addSemanticToken(builder, definition.selectionRange, tokenType, tokenModifiers);
    }

    for (const reference of analysis.references) {
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

import {
    AstVisitor,
    type AnyReferenceNode,
    type DeclarationNode,
    type Definition,
    type DefinitionKind,
} from "server/analysis/index.js";
import type { WorkspaceService } from "server/workspace/service.js";
import {
    SemanticTokensBuilder,
    type SemanticTokens,
    SemanticTokensLegend,
    SemanticTokenTypes,
    SemanticTokenModifiers,
    type Range,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

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

class SemanticTokensVisitor extends AstVisitor<void> {
    public constructor(private readonly builder: SemanticTokensBuilder) {
        super();
    }

    protected override visitDeclaration(node: DeclarationNode): void {
        this.addToken(
            node.declaration.selectionRange,
            SemanticTokensVisitor.getTokenTypeForDefinition(node.declaration.kind),
            SemanticTokensVisitor.getTokenModifierForDefinition(node.declaration),
        );
        this.visitChildren(node);
    }

    protected override visitReference(node: AnyReferenceNode): void {
        if (node.resolution !== undefined) {
            this.addToken(
                node.range,
                SemanticTokensVisitor.getTokenTypeForDefinition(node.resolution.declaration.kind),
                SemanticTokensVisitor.getTokenModifierForDefinition(node.resolution.declaration),
            );
        }
        this.visitChildren(node);
    }

    private addToken(
        range: Range,
        tokenType: SemanticTokenTypes,
        tokenModifiers: SemanticTokenModifiers,
    ): void {
        this.builder.push(
            range.start.line,
            range.start.character,
            range.end.character - range.start.character,
            SemanticTokensVisitor.getTokenTypeIndex(tokenType),
            SemanticTokensVisitor.getTokenModifierMask(tokenModifiers),
        );
    }

    private static getTokenTypeIndex(tokenType: SemanticTokenTypes): number {
        const index = legend.tokenTypes.indexOf(tokenType);
        return index >= 0 ? index : 0;
    }

    private static getTokenModifierMask(tokenModifier: SemanticTokenModifiers): number {
        const index = legend.tokenModifiers.indexOf(tokenModifier);
        return index >= 0 ? 1 << index : 0;
    }

    private static getTokenTypeForDefinition(kind: DefinitionKind): SemanticTokenTypes {
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

    private static getTokenModifierForDefinition(definition: Definition): SemanticTokenModifiers {
        return definition.origin === "builtin"
            ? SemanticTokenModifiers.defaultLibrary
            : SemanticTokenModifiers.definition;
    }
}

export function collectSemanticTokens(
    document: TextDocument,
    workspace: WorkspaceService,
): SemanticTokens {
    const analysis = workspace.getAnalysis(document);
    const builder = new SemanticTokensBuilder();
    new SemanticTokensVisitor(builder).visit(analysis.ast);
    return builder.build();
}

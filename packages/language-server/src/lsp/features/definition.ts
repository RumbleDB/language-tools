import { findSymbolAtPosition } from "server/analysis/index.js";
import type { WorkspaceService } from "server/workspace/service.js";
import { type Location, type Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

export function registerDefinition({
    connection,
    documents,
    workspace,
}: FeatureRegistrationContext): void {
    connection.onDefinition((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined
            ? null
            : findDefinitionLocation(document, params.position, workspace);
    });
}

/** Resolves a symbol to its source declaration or the XSD containing its schema type. */
export async function findDefinitionLocation(
    document: TextDocument,
    position: Position,
    workspace: WorkspaceService,
): Promise<Location | null> {
    const analysis = await workspace.getAnalysis(document);
    const occurrence = findSymbolAtPosition(analysis, position);
    const declaration = occurrence?.declaration;

    if (declaration?.origin === "schema" && declaration.sourceUri !== undefined) {
        // Xerces provides the source file but no declaration range.
        return {
            uri: declaration.sourceUri,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        };
    }

    if (declaration?.origin !== "source") {
        return null;
    }

    return {
        uri: declaration.uri,
        range: declaration.selectionRange,
    };
}

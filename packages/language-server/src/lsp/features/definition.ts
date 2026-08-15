import { findSymbolAtPosition } from "server/analysis/queries.js";
import { getAnalysis } from "server/workspace/service.js";
import { type Location, type Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

export function registerDefinition({ connection, documents }: FeatureRegistrationContext): void {
    connection.onDefinition((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined ? null : findDefinitionLocation(document, params.position);
    });
}

/**
 * Finds the definition location for the variable at the given position in the document, by analyzing variable scopes and occurrences.
 *
 * @param document The TextDocument representing the JSONiq source code to analyze
 * @param position The Position in the document for which to find the definition location (e.g. the position of the cursor in the editor)
 * @returns A Location object representing the definition location of the variable at the given position, or null if no definition is found
 */
export function findDefinitionLocation(
    document: TextDocument,
    position: Position,
): Location | null {
    const analysis = getAnalysis(document);
    const occurrence = findSymbolAtPosition(analysis, position);
    const declaration = occurrence?.declaration;

    if (declaration?.origin !== "source") {
        return null;
    }

    return {
        uri: declaration.uri,
        range: declaration.selectionRange,
    };
}

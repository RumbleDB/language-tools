import { type Location, type Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { isSourceDefinition } from "./analysis/definitions.js";
import { findSymbolAtPosition } from "./analysis/queries.js";
import { getAnalysis } from "./analysis/service.js";

/**
 * Finds the definition location for the variable at the given position in the document, by analyzing variable scopes and occurrences.
 *
 * @param document The TextDocument representing the JSONiq source code to analyze
 * @param position The Position in the document for which to find the definition location (e.g. the position of the cursor in the editor)
 * @returns A Location object representing the definition location of the variable at the given position, or null if no definition is found
 */
export async function findDefinitionLocation(
    document: TextDocument,
    position: Position,
): Promise<Location | null> {
    const analysis = await getAnalysis(document);
    const occurrence = findSymbolAtPosition(analysis, position);
    const declaration = occurrence?.declaration;

    if (!isSourceDefinition(declaration)) {
        return null;
    }

    return {
        uri: document.uri,
        range: declaration.selectionRange,
    };
}

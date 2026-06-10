import { type Location, type Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { isSourceDefinition } from "./analysis/definitions.js";
import { findSymbolAtPosition } from "./analysis/queries.js";
import { getAnalysis } from "./analysis/service.js";

/**
 * Finds all reference locations for the variable at the given position in the document, optionally including the declaration location.
 * This is used for the "find references" feature in the language server, allowing users to see all places where a variable is used in the source code.
 * @param document The TextDocument representing the JSONiq source code to analyze
 * @param position The Position in the document for which to find references (e.g. the position of the cursor in the editor)
 * @param includeDeclaration Whether to include the declaration location of the variable in the results, in addition to its references
 * @returns An array of Location objects representing all reference locations for the variable at the given position, optionally including the declaration location
 */
export async function findReferenceLocations(
    document: TextDocument,
    position: Position,
    includeDeclaration: boolean,
): Promise<Location[]> {
    const analysis = await getAnalysis(document);
    const occurrence = findSymbolAtPosition(analysis, position);
    const targetDeclaration = occurrence?.declaration;

    if (!isSourceDefinition(targetDeclaration)) {
        return [];
    }

    const locations: Location[] = [];

    if (includeDeclaration) {
        locations.push({
            uri: document.uri,
            range: targetDeclaration.selectionRange,
        });
    }

    for (const reference of targetDeclaration.references) {
        locations.push({
            uri: document.uri,
            range: reference.range,
        });
    }

    return locations;
}

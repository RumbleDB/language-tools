import { findSymbolAtPosition } from "server/analysis/queries.js";
import { getAnalysis, getWorkspaceReferencesToDefinition } from "server/workspace/service.js";
import { type Location, type Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

export function registerReferences({
    connection,
    documents,
    workspace,
    workspaceReady,
}: FeatureRegistrationContext): void {
    connection.onReferences(async (params) => {
        await workspaceReady.ready();
        const document = documents.get(params.textDocument.uri);
        return document === undefined
            ? []
            : findReferenceLocations(
                  document,
                  params.position,
                  params.context.includeDeclaration,
                  workspace,
              );
    });
}

/**
 * Finds all reference locations for the variable at the given position in the document, optionally including the declaration location.
 * This is used for the "find references" feature in the language server, allowing users to see all places where a variable is used in the source code.
 * @param document The TextDocument representing the JSONiq source code to analyze
 * @param position The Position in the document for which to find references (e.g. the position of the cursor in the editor)
 * @param includeDeclaration Whether to include the declaration location of the variable in the results, in addition to its references
 * @returns An array of Location objects representing all reference locations for the variable at the given position, optionally including the declaration location
 */
export function findReferenceLocations(
    document: TextDocument,
    position: Position,
    includeDeclaration: boolean,
    workspace = { getAnalysis, getReferencesToDefinition: getWorkspaceReferencesToDefinition },
): Location[] {
    const analysis = workspace.getAnalysis(document);
    const occurrence = findSymbolAtPosition(analysis, position);
    const targetDeclaration = occurrence?.declaration;

    if (targetDeclaration?.origin !== "source") {
        return [];
    }

    const locations: Location[] = [];

    if (includeDeclaration) {
        locations.push({
            uri: targetDeclaration.uri,
            range: targetDeclaration.selectionRange,
        });
    }

    for (const reference of workspace.getReferencesToDefinition(targetDeclaration)) {
        locations.push({
            uri: reference.uri,
            range: reference.range,
        });
    }

    return locations;
}

import type { SchemaImportAstNode } from "server/parser/types/ast.js";
import type { DocumentUri, Range } from "vscode-languageserver";

import type { ModuleImport } from "../analysis/model/module-info.js";

export interface ResolvedModuleLocation {
    readonly locationUri: string;
    readonly range: Range;
    readonly targetUri?: DocumentUri;
}

export function resolveModuleLocations(
    importerUri: DocumentUri,
    imported: ModuleImport,
): readonly ResolvedModuleLocation[] {
    const locations =
        imported.locations.length === 0
            ? [{ uri: imported.namespaceUri, range: imported.namespaceUriRange }]
            : imported.locations;

    return locations.map((location) => {
        try {
            return {
                locationUri: location.uri,
                targetUri: new URL(location.uri, importerUri).toString(),
                range: location.range,
            };
        } catch {
            return { locationUri: location.uri, range: location.range };
        }
    });
}

/** Schema location hints are relative to the query's effective static base URI. */
export function resolveSchemaLocations(
    documentUri: DocumentUri,
    imported: SchemaImportAstNode,
    declaredBaseUri?: string,
): readonly ResolvedModuleLocation[] {
    try {
        const baseUri = new URL(declaredBaseUri ?? documentUri, documentUri).href;
        return resolveModuleLocations(baseUri, imported);
    } catch {
        // Rumble reports invalid base URIs when loading the schema catalog.
        return [];
    }
}

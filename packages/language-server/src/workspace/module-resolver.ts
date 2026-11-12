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
    const baseUri = staticBaseUri(documentUri, declaredBaseUri);
    // Rumble reports invalid base URIs when loading the schema catalog.
    return baseUri === undefined ? [] : resolveModuleLocations(baseUri, imported);
}

/**
 * The URI that relative URIs in a query resolve against: its `declare base-uri`, itself resolved against the document,
 * or else the document. Undefined when the declared base URI is invalid.
 */
export function staticBaseUri(
    documentUri: DocumentUri,
    declaredBaseUri: string | undefined,
): string | undefined {
    try {
        return new URL(declaredBaseUri ?? documentUri, documentUri).href;
    } catch {
        return undefined;
    }
}

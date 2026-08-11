import type { DocumentUri, Range } from "vscode-languageserver";

import type { ModuleImport } from "../analysis/module-info.js";

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

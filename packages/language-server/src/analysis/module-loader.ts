import type { DocumentUri, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { ModuleImport } from "./module-info.js";
import { loadSourceFile } from "./workspace-files.js";

export interface ModuleLoader {
    loadImport(importer: TextDocument, imported: ModuleImport): readonly TextDocument[];
}

export interface ResolvedModuleLocation {
    readonly targetUri: DocumentUri;
    readonly range: Range;
}

export function resolveModuleLocations(
    importerUri: DocumentUri,
    imported: ModuleImport,
): readonly ResolvedModuleLocation[] {
    const locations =
        imported.locations.length === 0
            ? [{ uri: imported.namespaceUri, range: imported.namespaceUriRange }]
            : imported.locations;
    return locations.flatMap((location) => {
        const targetUri = resolveUri(location.uri, importerUri);
        return targetUri === undefined ? [] : [{ targetUri, range: location.range }];
    });
}

/**
 * Owns workspace document snapshots and resolves relative file module locations.
 * Open editor snapshots always take precedence over their on-disk counterpart.
 */
export class WorkspaceDocumentStore implements ModuleLoader {
    private readonly openDocuments = new Map<DocumentUri, TextDocument>();

    public update(document: TextDocument): boolean {
        const current = this.openDocuments.get(document.uri);
        if (current?.version === document.version && current.getText() === document.getText()) {
            return false;
        }
        this.openDocuments.set(document.uri, document);
        return true;
    }

    public remove(uri: DocumentUri): boolean {
        return this.openDocuments.delete(uri);
    }

    public getOpenDocuments(): readonly TextDocument[] {
        return [...this.openDocuments.values()];
    }

    public load(uri: DocumentUri): TextDocument | undefined {
        return this.openDocuments.get(uri) ?? loadSourceFile(uri);
    }

    public loadImport(importer: TextDocument, imported: ModuleImport): readonly TextDocument[] {
        const modules: TextDocument[] = [];
        const seenUris = new Set<DocumentUri>();
        for (const { targetUri } of resolveModuleLocations(importer.uri, imported)) {
            if (seenUris.has(targetUri)) continue;
            seenUris.add(targetUri);

            const document = this.load(targetUri);
            if (document !== undefined) modules.push(document);
        }
        return modules;
    }
}

function resolveUri(location: string, baseUri: DocumentUri): DocumentUri | undefined {
    try {
        return new URL(location, baseUri).toString();
    } catch {
        return undefined;
    }
}

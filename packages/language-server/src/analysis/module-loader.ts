import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { DocumentUri, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { ModuleImport } from "./module-info.js";

interface ResolvedModuleLocation {
    readonly targetUri: DocumentUri;
    readonly range: Range;
}

export interface ModuleLoadResult {
    readonly locationUri: string;
    readonly range: Range;
    readonly document?: TextDocument;
}

export function resolveModuleLocations(
    importerUri: DocumentUri,
    imported: ModuleImport,
): readonly ResolvedModuleLocation[] {
    return importLocations(imported).flatMap((location) => {
        const targetUri = resolveUri(location.uri, importerUri);
        return targetUri === undefined ? [] : [{ targetUri, range: location.range }];
    });
}

/**
 * Owns workspace document snapshots and resolves relative file module locations.
 * Open editor snapshots always take precedence over their on-disk counterpart.
 */
export class WorkspaceDocumentStore {
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

    public loadImport(importer: TextDocument, imported: ModuleImport): readonly ModuleLoadResult[] {
        const results: ModuleLoadResult[] = [];
        const seenUris = new Set<DocumentUri>();
        for (const location of importLocations(imported)) {
            const targetUri = resolveUri(location.uri, importer.uri);
            if (targetUri === undefined) {
                results.push({ locationUri: location.uri, range: location.range });
                continue;
            }
            if (seenUris.has(targetUri)) continue;
            seenUris.add(targetUri);

            const document = this.openDocuments.get(targetUri) ?? loadFileDocument(targetUri);
            results.push({
                locationUri: location.uri,
                range: location.range,
                ...(document === undefined ? {} : { document }),
            });
        }
        return results;
    }
}

function importLocations(imported: ModuleImport): readonly { uri: string; range: Range }[] {
    return imported.locations.length === 0
        ? [{ uri: imported.namespaceUri, range: imported.namespaceUriRange }]
        : imported.locations;
}

function resolveUri(location: string, baseUri: DocumentUri): DocumentUri | undefined {
    try {
        return new URL(location, baseUri).toString();
    } catch {
        return undefined;
    }
}

function loadFileDocument(uri: DocumentUri): TextDocument | undefined {
    if (!uri.startsWith("file:")) return undefined;
    try {
        const path = fileURLToPath(uri);
        if (!statSync(path).isFile()) return undefined;
        return TextDocument.create(uri, languageIdFor(path), 0, readFileSync(path, "utf8"));
    } catch {
        // Missing, unreadable, and invalid file locations are unresolved imports,
        // not failures of the language-server request that triggered analysis.
        return undefined;
    }
}

function languageIdFor(path: string): string {
    return path.endsWith(".xq") || path.endsWith(".xqm") ? "xquery" : "jsoniq";
}

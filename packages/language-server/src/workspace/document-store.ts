import type { DocumentUri, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { ModuleImport } from "../analysis/module-info.js";
import { loadSourceFile } from "./files.js";
import { resolveModuleLocations } from "./module-resolver.js";

export interface ModuleLoadResult {
    readonly locationUri: string;
    readonly range: Range;
    readonly targetUri?: DocumentUri;
    readonly document?: TextDocument;
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

    public load(uri: DocumentUri): TextDocument | undefined {
        return this.openDocuments.get(uri) ?? loadSourceFile(uri);
    }

    public loadImport(importer: TextDocument, imported: ModuleImport): readonly ModuleLoadResult[] {
        const results: ModuleLoadResult[] = [];
        const seenUris = new Set<DocumentUri>();

        for (const location of resolveModuleLocations(importer.uri, imported)) {
            if (location.targetUri === undefined) {
                results.push(location);
                continue;
            }
            if (seenUris.has(location.targetUri)) continue;
            seenUris.add(location.targetUri);

            const document = this.load(location.targetUri);
            results.push({
                ...location,
                ...(document === undefined ? {} : { document }),
            });
        }

        return results;
    }
}

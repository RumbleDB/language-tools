import type { DocumentUri, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { FileChangeType, type FileEvent } from "vscode-languageserver/node";

import type { ModuleImport } from "../analysis/module-info.js";
import { isSupportedSourceUri, loadSourceFile } from "./files.js";
import { resolveModuleLocations } from "./module-resolver.js";

export interface ModuleLoadResult {
    readonly locationUri: string;
    readonly range: Range;
    readonly targetUri?: DocumentUri;
    readonly document?: TextDocument;
}

export interface WorkspaceDocumentChanges {
    readonly added: ReadonlySet<DocumentUri>;
    readonly removed: ReadonlySet<DocumentUri>;
}

/**
 * Owns workspace document snapshots and resolves relative file module locations.
 * Open editor snapshots always take precedence over their on-disk counterpart.
 */
export class WorkspaceDocumentStore {
    private readonly openDocuments = new Map<DocumentUri, TextDocument>();
    private readonly workspaceDocumentUris = new Set<DocumentUri>();

    public updateOpenDocument(document: TextDocument): boolean {
        const current = this.openDocuments.get(document.uri);
        if (current?.version === document.version && current.getText() === document.getText()) {
            return false;
        }
        this.openDocuments.set(document.uri, document);
        return true;
    }

    public removeOpenDocument(uri: DocumentUri): boolean {
        return this.openDocuments.delete(uri);
    }

    public getOpenDocumentVersion(uri: DocumentUri): number | undefined {
        return this.openDocuments.get(uri)?.version;
    }

    public getTrackedDocumentUris(): readonly DocumentUri[] {
        return [...new Set([...this.workspaceDocumentUris, ...this.openDocuments.keys()])];
    }

    public replaceWorkspaceDocuments(uris: readonly DocumentUri[]): WorkspaceDocumentChanges {
        const nextUris = new Set(uris);
        const added = new Set([...nextUris].filter((uri) => !this.workspaceDocumentUris.has(uri)));
        const removed = new Set(
            [...this.workspaceDocumentUris].filter((uri) => !nextUris.has(uri)),
        );

        this.workspaceDocumentUris.clear();
        for (const uri of nextUris) this.workspaceDocumentUris.add(uri);

        return { added, removed };
    }

    public updateWorkspaceDocuments(changes: readonly FileEvent[]): void {
        for (const change of changes) {
            if (change.type === FileChangeType.Deleted) {
                this.workspaceDocumentUris.delete(change.uri);
            } else if (isSupportedSourceUri(change.uri)) {
                this.workspaceDocumentUris.add(change.uri);
            }
        }
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

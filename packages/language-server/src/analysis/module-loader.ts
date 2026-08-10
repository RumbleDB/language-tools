import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { ModuleImport } from "./module-info.js";

export interface ModuleLoader {
    loadImport(importer: TextDocument, imported: ModuleImport): readonly TextDocument[];
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

    public loadImport(importer: TextDocument, imported: ModuleImport): readonly TextDocument[] {
        const modules: TextDocument[] = [];
        const seenUris = new Set<DocumentUri>();
        for (const location of imported.locations) {
            const uri = resolveUri(location.uri, importer.uri);
            if (uri === undefined || seenUris.has(uri)) continue;
            seenUris.add(uri);

            const open = this.openDocuments.get(uri);
            if (open !== undefined) {
                modules.push(open);
                continue;
            }
            const document = loadFileDocument(uri);
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

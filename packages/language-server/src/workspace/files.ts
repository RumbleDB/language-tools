import { readFileSync, statSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

const LANGUAGE_BY_EXTENSION = new Map([
    [".jq", "jsoniq"],
    [".jsoniq", "jsoniq"],
    [".jqm", "jsoniq"],
    [".xq", "xquery"],
    [".xqy", "xquery"],
    [".xquery", "xquery"],
    [".xqm", "xquery"],
]);

const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);

export function languageIdForWorkspacePath(filePath: string): string | undefined {
    return LANGUAGE_BY_EXTENSION.get(path.extname(filePath).toLowerCase());
}

export function isSupportedSourceUri(uri: DocumentUri): boolean {
    if (!uri.startsWith("file:")) return false;
    try {
        return languageIdForWorkspacePath(fileURLToPath(uri)) !== undefined;
    } catch {
        return false;
    }
}

export function loadSourceFile(uri: DocumentUri): TextDocument | undefined {
    if (!uri.startsWith("file:")) return undefined;

    try {
        const filePath = fileURLToPath(uri);
        if (!statSync(filePath).isFile()) return undefined;
        const languageId = languageIdForWorkspacePath(filePath) ?? "jsoniq";
        return TextDocument.create(uri, languageId, 0, readFileSync(filePath, "utf8"));
    } catch {
        return undefined;
    }
}

export async function discoverWorkspaceDocumentUris(
    workspaceFolderUris: readonly DocumentUri[],
): Promise<readonly DocumentUri[]> {
    const documents = new Set<DocumentUri>();

    for (const folderUri of workspaceFolderUris) {
        if (!folderUri.startsWith("file:")) continue;

        try {
            const rootPath = fileURLToPath(folderUri);
            if (!(await stat(rootPath)).isDirectory()) continue;
            await discoverDirectory(rootPath, documents);
        } catch {
            // Unsupported and unreadable workspace folders contain no discoverable documents.
        }
    }

    return [...documents];
}

async function discoverDirectory(directory: string, documents: Set<DocumentUri>): Promise<void> {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (!IGNORED_DIRECTORIES.has(entry.name)) {
                await discoverDirectory(entryPath, documents);
            }
            continue;
        }
        if (entry.isFile() && languageIdForWorkspacePath(entryPath) !== undefined) {
            documents.add(pathToFileURL(entryPath).toString());
        }
    }
}

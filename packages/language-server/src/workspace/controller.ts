import type { DocumentUri } from "vscode-languageserver";
import type { FileEvent } from "vscode-languageserver/node";

import { discoverWorkspaceDocumentUris } from "./files.js";
import { replaceWorkspaceDocuments, updateWorkspaceDocuments } from "./service.js";

export class WorkspaceController {
    private readonly folderUris = new Set<DocumentUri>();
    private pending = Promise.resolve();

    public constructor(private readonly reportError: (error: unknown) => void) {}

    public initialize(folderUris: readonly DocumentUri[]): void {
        for (const uri of folderUris) this.folderUris.add(uri);
        this.queueRebuild();
    }

    public updateFolders(added: readonly DocumentUri[], removed: readonly DocumentUri[]): void {
        for (const uri of removed) this.folderUris.delete(uri);
        for (const uri of added) this.folderUris.add(uri);
        this.queueRebuild();
    }

    public updateDocuments(changes: readonly FileEvent[]): void {
        this.queue(() => updateWorkspaceDocuments(changes));
    }

    public ready(): Promise<void> {
        return this.pending;
    }

    private queueRebuild(): void {
        this.queue(async () => {
            const documents = await discoverWorkspaceDocumentUris([...this.folderUris]);
            replaceWorkspaceDocuments(documents);
        });
    }

    private queue(task: () => void | Promise<void>): void {
        this.pending = this.pending.then(task).catch(this.reportError);
    }
}

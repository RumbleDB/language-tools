import type { DocumentUri } from "vscode-languageserver";

import { discoverWorkspaceDocumentUris } from "./files.js";
import { replaceWorkspaceDocuments, updateWorkspaceDocuments } from "./service.js";
import type { WorkspaceDocumentChange } from "./workspace-index.js";

export interface WorkspaceControllerBackend {
    discover(folderUris: readonly DocumentUri[]): Promise<readonly DocumentUri[]>;
    replaceDocuments(uris: readonly DocumentUri[]): void;
    updateDocuments(changes: readonly WorkspaceDocumentChange[]): void;
}

const defaultBackend: WorkspaceControllerBackend = {
    discover: discoverWorkspaceDocumentUris,
    replaceDocuments: replaceWorkspaceDocuments,
    updateDocuments: updateWorkspaceDocuments,
};

export class WorkspaceController {
    private readonly folderUris = new Set<DocumentUri>();
    private pending = Promise.resolve();

    public constructor(
        private readonly reportError: (error: unknown) => void,
        private readonly backend: WorkspaceControllerBackend = defaultBackend,
    ) {}

    public initialize(folderUris: readonly DocumentUri[]): void {
        for (const uri of folderUris) this.folderUris.add(uri);
        this.queueRebuild();
    }

    public updateFolders(added: readonly DocumentUri[], removed: readonly DocumentUri[]): void {
        for (const uri of removed) this.folderUris.delete(uri);
        for (const uri of added) this.folderUris.add(uri);
        this.queueRebuild();
    }

    public updateDocuments(changes: readonly WorkspaceDocumentChange[]): void {
        this.queue(() => this.backend.updateDocuments(changes));
    }

    public ready(): Promise<void> {
        return this.pending;
    }

    private queueRebuild(): void {
        this.queue(async () => {
            const documents = await this.backend.discover([...this.folderUris]);
            this.backend.replaceDocuments(documents);
        });
    }

    private queue(task: () => void | Promise<void>): void {
        this.pending = this.pending.then(task).catch(this.reportError);
    }
}

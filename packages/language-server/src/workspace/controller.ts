import type { DocumentUri } from "vscode-languageserver";
import type { FileEvent } from "vscode-languageserver/node";

import { createLogger } from "../utils/logger.js";
import { discoverWorkspaceDocumentUris } from "./files.js";
import { replaceWorkspaceDocuments, updateWorkspaceDocuments } from "./service.js";

const logger = createLogger("workspace-controller");

export class WorkspaceController {
    private readonly folderUris = new Set<DocumentUri>();
    private pending = Promise.resolve();

    public constructor(
        private readonly refreshAffectedDocuments: (
            affected: ReadonlySet<DocumentUri>,
        ) => void | Promise<void> = () => {},
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

    public updateDocuments(changes: readonly FileEvent[]): void {
        this.queue(() => this.scheduleRefresh(updateWorkspaceDocuments(changes)));
    }

    public ready(): Promise<void> {
        return this.pending;
    }

    private queueRebuild(): void {
        this.queue(async () => {
            const documents = await discoverWorkspaceDocumentUris([...this.folderUris]);
            this.scheduleRefresh(replaceWorkspaceDocuments(documents));
        });
    }

    private scheduleRefresh(affected: ReadonlySet<DocumentUri>): void {
        try {
            void Promise.resolve(this.refreshAffectedDocuments(affected)).catch(
                (error: unknown) => {
                    logger.error("Workspace document refresh failed.", error);
                },
            );
        } catch (error) {
            logger.error("Workspace document refresh failed.", error);
        }
    }

    private queue(task: () => void | Promise<void>): void {
        this.pending = this.pending.then(task).catch((error: unknown) => {
            logger.error("Workspace indexing failed.", error);
        });
    }
}

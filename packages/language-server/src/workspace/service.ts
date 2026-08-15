import type { DocumentUri } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { FileEvent } from "vscode-languageserver/node";

import type { AnalysisResult } from "../analysis/builder.js";
import type { Definition } from "../analysis/definitions.js";
import type { AnyResolvedReference } from "../analysis/reference.js";
import { createLogger } from "../utils/logger.js";
import { discoverWorkspaceDocumentUris } from "./files.js";
import { WorkspaceIndex } from "./workspace-index.js";

const logger = createLogger("workspace");

export class WorkspaceService {
    private readonly folderUris = new Set<DocumentUri>();
    private pending = Promise.resolve();

    public constructor(
        private readonly index: WorkspaceIndex = new WorkspaceIndex(),
        private readonly discoverDocuments: (
            folderUris: readonly DocumentUri[],
        ) => Promise<readonly DocumentUri[]> = discoverWorkspaceDocumentUris,
    ) {}

    public setWorkspaceFolders(folderUris: readonly DocumentUri[]): void {
        this.folderUris.clear();
        for (const uri of folderUris) this.folderUris.add(uri);
        this.queueWorkspaceScan();
    }

    public updateWorkspaceFolders(
        added: readonly DocumentUri[],
        removed: readonly DocumentUri[],
    ): void {
        for (const uri of removed) this.folderUris.delete(uri);
        for (const uri of added) this.folderUris.add(uri);
        this.queueWorkspaceScan();
    }

    public updateWatchedFiles(changes: readonly FileEvent[]): void {
        this.queue(() => this.index.updateWorkspaceDocuments(changes));
    }

    public ready(): Promise<void> {
        return this.pending;
    }

    public getAnalysis(document: TextDocument): AnalysisResult {
        return this.index.getAnalysis(document);
    }

    public setWorkspaceDocuments(uris: readonly DocumentUri[]): void {
        this.index.replaceWorkspaceDocuments(uris);
    }

    public updateOpenDocument(document: TextDocument): void {
        this.index.updateOpenDocument(document);
    }

    public removeOpenDocument(uri: DocumentUri): void {
        this.index.removeOpenDocument(uri);
    }

    public getReferencesToDefinition(definition: Definition): readonly AnyResolvedReference[] {
        return this.index.getReferencesToDefinition(definition);
    }

    private queueWorkspaceScan(): void {
        this.queue(async () => {
            const documents = await this.discoverDocuments([...this.folderUris]);
            this.index.replaceWorkspaceDocuments(documents);
        });
    }

    private queue(task: () => void | Promise<void>): void {
        this.pending = this.pending.then(task).catch((error: unknown) => {
            logger.error("Workspace indexing failed.", error);
        });
    }
}

export const workspaceService = new WorkspaceService();

import type { DocumentUri } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { FileEvent } from "vscode-languageserver/node";

import type { Definition } from "../analysis/model/definitions.js";
import type { AnyResolvedReference } from "../analysis/model/reference.js";
import type { AnalysisResult } from "../analysis/model/result.js";
import { createLogger } from "../utils/logger.js";
import { discoverWorkspaceDocumentUris } from "./files.js";
import { WorkspaceIndex } from "./workspace-index.js";

const logger = createLogger("workspace");

export class WorkspaceService {
    private readonly folderUris = new Set<DocumentUri>();
    private pending = Promise.resolve();

    public constructor(
        private readonly index: WorkspaceIndex,
        private readonly discoverDocuments: (
            folderUris: readonly DocumentUri[],
        ) => Promise<readonly DocumentUri[]> = discoverWorkspaceDocumentUris,
    ) {}

    public setWorkspaceFolders(folderUris: readonly DocumentUri[]): Promise<void> {
        this.folderUris.clear();
        for (const uri of folderUris) this.folderUris.add(uri);
        return this.queueWorkspaceScan();
    }

    public updateWorkspaceFolders(
        added: readonly DocumentUri[],
        removed: readonly DocumentUri[],
    ): Promise<void> {
        for (const uri of removed) this.folderUris.delete(uri);
        for (const uri of added) this.folderUris.add(uri);
        return this.queueWorkspaceScan();
    }

    public updateWatchedFiles(changes: readonly FileEvent[]): Promise<void> {
        return this.queue(() => this.index.updateWorkspaceDocuments(changes));
    }

    public getAnalysis(document: TextDocument): AnalysisResult {
        return this.index.getAnalysis(document);
    }

    public updateOpenDocument(document: TextDocument): void {
        this.index.updateOpenDocument(document);
    }

    public removeOpenDocument(uri: DocumentUri): void {
        this.index.removeOpenDocument(uri);
    }

    public async getReferencesToDefinition(
        definition: Definition,
    ): Promise<readonly AnyResolvedReference[]> {
        await this.pending;
        return this.index.getReferencesToDefinition(definition);
    }

    private queueWorkspaceScan(): Promise<void> {
        return this.queue(async () => {
            const documents = await this.discoverDocuments([...this.folderUris]);
            this.index.replaceWorkspaceDocuments(documents);
        });
    }

    private queue(task: () => void | Promise<void>): Promise<void> {
        this.pending = this.pending.then(task).catch((error: unknown) => {
            logger.error("Workspace indexing failed.", error);
        });
        return this.pending;
    }
}

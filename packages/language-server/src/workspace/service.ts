import type { DocumentUri } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { FileEvent } from "vscode-languageserver/node";

import type { AnalysisResult } from "../analysis/builder.js";
import type { Definition } from "../analysis/definitions.js";
import type { AnyResolvedReference } from "../analysis/reference.js";
import { WorkspaceIndex } from "./workspace-index.js";

export class WorkspaceService {
    public constructor(private readonly index: WorkspaceIndex = new WorkspaceIndex()) {}

    public getAnalysis(document: TextDocument): AnalysisResult {
        return this.index.getAnalysis(document);
    }

    public replaceDocuments(uris: readonly DocumentUri[]): void {
        this.index.replaceWorkspaceDocuments(uris);
    }

    public updateDocuments(changes: readonly FileEvent[]): void {
        this.index.updateWorkspaceDocuments(changes);
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
}

export const workspaceService = new WorkspaceService();

export function getAnalysis(document: TextDocument): AnalysisResult {
    return workspaceService.getAnalysis(document);
}

export function replaceWorkspaceDocuments(uris: readonly DocumentUri[]): void {
    workspaceService.replaceDocuments(uris);
}

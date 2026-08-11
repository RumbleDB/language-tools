import type { DocumentUri } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { AnalysisResult } from "../analysis/builder.js";
import type { Definition } from "../analysis/definitions.js";
import type { AnyResolvedReference } from "../analysis/reference.js";
import { WorkspaceIndex, type WorkspaceDocumentChange } from "./workspace-index.js";

const workspaceIndex = new WorkspaceIndex();

export function getAnalysis(document: TextDocument): AnalysisResult {
    return workspaceIndex.getAnalysis(document);
}

export function replaceWorkspaceDocuments(uris: readonly DocumentUri[]): void {
    workspaceIndex.replaceWorkspaceDocuments(uris);
}

export function updateWorkspaceDocuments(changes: readonly WorkspaceDocumentChange[]): void {
    workspaceIndex.updateWorkspaceDocuments(changes);
}

export function updateOpenDocument(document: TextDocument): void {
    workspaceIndex.updateOpenDocument(document);
}

export function removeOpenDocument(uri: DocumentUri): void {
    workspaceIndex.removeOpenDocument(uri);
}

export function getWorkspaceReferencesToDefinition(
    definition: Definition,
): readonly AnyResolvedReference[] {
    return workspaceIndex.getReferencesToDefinition(definition);
}

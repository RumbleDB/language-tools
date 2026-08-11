import type { DocumentUri } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { FileEvent } from "vscode-languageserver/node";

import type { AnalysisResult } from "../analysis/builder.js";
import type { Definition } from "../analysis/definitions.js";
import type { AnyResolvedReference } from "../analysis/reference.js";
import type { DocumentStamp } from "./document-stamp.js";
import { WorkspaceIndex } from "./workspace-index.js";

const workspaceIndex = new WorkspaceIndex();

export function getAnalysis(document: TextDocument): AnalysisResult {
    return workspaceIndex.getAnalysis(document);
}

export function createDocumentStamp(document: TextDocument): DocumentStamp {
    return workspaceIndex.createDocumentStamp(document);
}

export function isDocumentStampCurrent(stamp: DocumentStamp): boolean {
    return workspaceIndex.isDocumentStampCurrent(stamp);
}

export function getAffectedDocuments(uris: readonly DocumentUri[]): ReadonlySet<DocumentUri> {
    return workspaceIndex.getAffectedDocuments(uris);
}

export function replaceWorkspaceDocuments(uris: readonly DocumentUri[]): ReadonlySet<DocumentUri> {
    return workspaceIndex.replaceWorkspaceDocuments(uris);
}

export function updateWorkspaceDocuments(changes: readonly FileEvent[]): ReadonlySet<DocumentUri> {
    return workspaceIndex.updateWorkspaceDocuments(changes);
}

export function updateOpenDocument(document: TextDocument): ReadonlySet<DocumentUri> {
    return workspaceIndex.updateOpenDocument(document);
}

export function removeOpenDocument(uri: DocumentUri): ReadonlySet<DocumentUri> {
    return workspaceIndex.removeOpenDocument(uri);
}

export function getWorkspaceReferencesToDefinition(
    definition: Definition,
): readonly AnyResolvedReference[] {
    return workspaceIndex.getReferencesToDefinition(definition);
}

import type { DocumentUri } from "vscode-languageserver";

/** Identifies the document and dependency state used by an analysis operation. */
export interface DocumentStamp {
    readonly uri: DocumentUri;
    readonly documentVersion: number;
    readonly workspaceRevision: number;
}

export function sameDocumentStamp(left: DocumentStamp, right: DocumentStamp): boolean {
    return (
        left.uri === right.uri &&
        left.documentVersion === right.documentVersion &&
        left.workspaceRevision === right.workspaceRevision
    );
}

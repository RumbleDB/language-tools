import { supportsDocument } from "server/parser/registry.js";
import type { WorkspaceController } from "server/workspace/controller.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

export interface FeatureRegistrationContext {
    readonly connection: Connection;
    readonly documents: SupportedDocuments;
    readonly workspace: Pick<WorkspaceController, "ready">;
}

export interface SupportedDocuments {
    get(uri: string): TextDocument | undefined;
}

export function createFeatureRegistrationContext(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
    workspace: WorkspaceController,
): FeatureRegistrationContext {
    return {
        connection,
        workspace,
        documents: {
            get(uri) {
                const document = documents.get(uri);
                return document !== undefined && supportsDocument(document) ? document : undefined;
            },
        },
    };
}

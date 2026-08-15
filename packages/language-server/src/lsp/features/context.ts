import type { ParserService } from "server/parser/index.js";
import { supportsDocument } from "server/parser/registry.js";
import type { WorkspaceController } from "server/workspace/controller.js";
import type { WorkspaceService } from "server/workspace/service.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

export interface FeatureRegistrationContext {
    readonly connection: Connection;
    readonly documents: SupportedDocuments;
    readonly parser: ParserService;
    readonly workspace: WorkspaceService;
    readonly workspaceReady: Pick<WorkspaceController, "ready">;
}

export interface SupportedDocuments {
    get(uri: string): TextDocument | undefined;
}

export function createFeatureRegistrationContext(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
    parser: ParserService,
    workspace: WorkspaceService,
    workspaceReady: WorkspaceController,
): FeatureRegistrationContext {
    return {
        connection,
        parser,
        workspace,
        workspaceReady,
        documents: {
            get(uri) {
                const document = documents.get(uri);
                return document !== undefined && supportsDocument(document) ? document : undefined;
            },
        },
    };
}

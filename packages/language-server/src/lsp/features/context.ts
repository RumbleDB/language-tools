import type { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import type { ParserService } from "server/parser/index.js";
import { supportsDocument } from "server/parser/registry.js";
import type { WorkspaceService } from "server/workspace/service.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

export interface FeatureRegistrationContext {
    readonly connection: Connection;
    readonly documents: SupportedDocuments;
    readonly parser: ParserService;
    readonly workspace: WorkspaceService;
    readonly wrapper: RumbleWrapperClient;
}

export interface SupportedDocuments {
    get(uri: string): TextDocument | undefined;
}

export function createFeatureRegistrationContext(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
    parser: ParserService,
    workspace: WorkspaceService,
    wrapper: RumbleWrapperClient,
): FeatureRegistrationContext {
    return {
        connection,
        parser,
        workspace,
        wrapper,
        documents: {
            get(uri) {
                const document = documents.get(uri);
                return document !== undefined && supportsDocument(document) ? document : undefined;
            },
        },
    };
}

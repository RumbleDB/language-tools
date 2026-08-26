import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments, type Connection } from "vscode-languageserver/node";

import { type WrapperClient, RumbleWrapperClient } from "../integrations/rumble/client.js";
import { ParserService } from "../parser/index.js";
import { WorkspaceDocumentStore } from "../workspace/document-store.js";
import { WorkspaceService } from "../workspace/service.js";
import { WorkspaceIndex } from "../workspace/workspace-index.js";
import { DiagnosticsManager } from "./diagnostics.js";

export interface ServerContext {
    readonly documents: TextDocuments<TextDocument>;
    readonly parser: ParserService;
    readonly workspace: WorkspaceService;
    readonly diagnostics: DiagnosticsManager;
    readonly wrapper: WrapperClient;
}

export function createServerContext(
    connection: Connection,
    wrapper: WrapperClient = new RumbleWrapperClient(),
): ServerContext {
    const documents = new TextDocuments(TextDocument);
    const parser = new ParserService();
    const workspace = new WorkspaceService(
        new WorkspaceIndex(parser, new WorkspaceDocumentStore()),
    );

    return {
        documents,
        parser,
        workspace,
        wrapper,
        diagnostics: new DiagnosticsManager(connection, documents, parser, workspace, wrapper),
    };
}

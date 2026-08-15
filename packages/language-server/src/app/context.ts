import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments, type Connection } from "vscode-languageserver/node";

import { parserService, type ParserService } from "../parser/index.js";
import { WorkspaceController } from "../workspace/controller.js";
import { workspaceService, type WorkspaceService } from "../workspace/service.js";
import { DiagnosticsManager } from "./diagnostics.js";

export interface ServerContext {
    readonly documents: TextDocuments<TextDocument>;
    readonly parser: ParserService;
    readonly workspace: WorkspaceService;
    readonly workspaceController: WorkspaceController;
    readonly diagnostics: DiagnosticsManager;
}

export function createServerContext(connection: Connection): ServerContext {
    const documents = new TextDocuments(TextDocument);
    const workspaceController = new WorkspaceController(workspaceService);

    return {
        documents,
        parser: parserService,
        workspace: workspaceService,
        workspaceController,
        diagnostics: new DiagnosticsManager(connection, documents, parserService, workspaceService),
    };
}

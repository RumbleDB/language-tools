import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments, type Connection } from "vscode-languageserver/node";

import { parserService, type ParserService } from "../parser/index.js";
import { workspaceService, type WorkspaceService } from "../workspace/service.js";
import { DiagnosticsManager } from "./diagnostics.js";

export interface ServerContext {
    readonly documents: TextDocuments<TextDocument>;
    readonly parser: ParserService;
    readonly workspace: WorkspaceService;
    readonly diagnostics: DiagnosticsManager;
}

export function createServerContext(connection: Connection): ServerContext {
    const documents = new TextDocuments(TextDocument);
    return {
        documents,
        parser: parserService,
        workspace: workspaceService,
        diagnostics: new DiagnosticsManager(connection, documents, parserService, workspaceService),
    };
}

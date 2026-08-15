import {
    createConnection,
    ProposedFeatures,
    type InitializeParams,
    type InitializeResult,
} from "vscode-languageserver/node";

import { clearStaticTypecheckCache } from "../integrations/rumble/operations/static-typecheck/service.js";
import { registerLanguageFeatureHandlers } from "../lsp/handlers/register.js";
import { initializeNotifications } from "../notifications/index.js";
import { initializeCustomRequests } from "../requests/index.js";
import { setLoggerSink } from "../utils/logger.js";
import { serverCapabilities } from "./capabilities.js";
import { config, InitializationOptions, mergeConfiguration } from "./configuration.js";
import { createServerContext } from "./context.js";

export type ClientConfiguration = Partial<InitializationOptions>;

const connection = createConnection(ProposedFeatures.all);
const context = createServerContext(connection);
const { documents, parser, workspace, workspaceController, diagnostics } = context;

setLoggerSink(connection.console);
initializeNotifications((method, payload) => {
    connection.sendNotification(method, payload);
});
initializeCustomRequests(connection, documents);
registerLanguageFeatureHandlers(connection, documents, parser, workspace, workspaceController);

connection.onInitialize((params: InitializeParams): InitializeResult => {
    const clientConfiguration: Partial<InitializationOptions> = params.initializationOptions || {};
    mergeConfiguration(clientConfiguration);
    connection.console.log(`Language server configuration: ${JSON.stringify(config, null, 4)}`);

    const initialWorkspaceFolderUris = params.workspaceFolders?.map((folder) => folder.uri) || [];
    workspaceController.initialize(initialWorkspaceFolderUris);

    return {
        capabilities: serverCapabilities,
        serverInfo: {
            name: "JSONiq Language Server",
            version: require("../../package.json").version,
        },
    };
});

documents.onDidOpen(async (event) => {
    workspace.updateOpenDocument(event.document);
    await diagnostics.refresh(event.document.uri);
});

documents.onDidChangeContent(async (event) => {
    workspace.updateOpenDocument(event.document);
    await diagnostics.refresh(event.document.uri);
});

documents.onDidClose((event) => {
    workspace.removeOpenDocument(event.document.uri);
    parser.clear(event.document.uri);
    clearStaticTypecheckCache(event.document.uri);
    diagnostics.clear(event.document.uri);
});

connection.onDidChangeWatchedFiles((params) => {
    workspaceController.updateDocuments(params.changes);
});

connection.onInitialized(() => {
    connection.workspace.onDidChangeWorkspaceFolders((params) => {
        workspaceController.updateFolders(
            params.added.map((folder) => folder.uri),
            params.removed.map((folder) => folder.uri),
        );
    });
});

documents.listen(connection);
connection.listen();

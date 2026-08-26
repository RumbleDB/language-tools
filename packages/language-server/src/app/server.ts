import {
    createConnection,
    ProposedFeatures,
    type InitializeParams,
    type InitializeResult,
} from "vscode-languageserver/node";

import { clearStaticTypecheckCache } from "../integrations/rumble/operations/static-typecheck/service.js";
import { registerLanguageFeatureHandlers } from "../lsp/handlers/register.js";
import { registerRequestHandlers } from "../lsp/handlers/requests/register.js";
import { registerNotifications } from "../lsp/notifications/register.js";
import { setLoggerSink } from "../utils/logger.js";
import { serverCapabilities } from "./capabilities.js";
import { config, InitializationOptions, mergeConfiguration } from "./configuration.js";
import { createServerContext } from "./context.js";

export type ClientConfiguration = Partial<InitializationOptions>;

const connection = createConnection(ProposedFeatures.all);
const context = createServerContext(connection);
const { documents, parser, workspace, diagnostics, wrapper } = context;

setLoggerSink(connection.console);
registerNotifications(connection, wrapper);
registerRequestHandlers(connection, documents, wrapper);
registerLanguageFeatureHandlers({
    connection,
    documents,
    parser,
    workspace,
    wrapper,
});

connection.onInitialize((params: InitializeParams): InitializeResult => {
    const clientConfiguration: Partial<InitializationOptions> = params.initializationOptions || {};
    mergeConfiguration(clientConfiguration);
    connection.console.log(`Language server configuration: ${JSON.stringify(config, null, 4)}`);

    const initialWorkspaceFolderUris = params.workspaceFolders?.map((folder) => folder.uri) || [];
    workspace.setWorkspaceFolders(initialWorkspaceFolderUris);

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
    await diagnostics.refresh(event.document);
});

documents.onDidChangeContent(async (event) => {
    workspace.updateOpenDocument(event.document);
    await diagnostics.refresh(event.document);
});

documents.onDidClose((event) => {
    workspace.removeOpenDocument(event.document.uri);
    parser.clear(event.document.uri);
    clearStaticTypecheckCache(event.document.uri);
    diagnostics.clear(event.document);
});

connection.onDidChangeWatchedFiles((params) => {
    workspace.updateWatchedFiles(params.changes);
});

connection.onInitialized(() => {
    connection.workspace.onDidChangeWorkspaceFolders((params) => {
        workspace.updateWorkspaceFolders(
            params.added.map((folder) => folder.uri),
            params.removed.map((folder) => folder.uri),
        );
    });
});

connection.onShutdown(() => {
    wrapper.dispose?.();
});

documents.listen(connection);
connection.listen();

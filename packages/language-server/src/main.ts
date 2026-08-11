import { TextDocument } from "vscode-languageserver-textdocument";
import {
    TextDocumentSyncKind,
    createConnection,
    ProposedFeatures,
    TextDocuments,
    type InitializeParams,
    type InitializeResult,
} from "vscode-languageserver/node";

import { findCompletionsWithTypeInfo } from "./completion.js";
import { config, InitializationOptions, mergeConfiguration } from "./config.js";
import { findDefinitionLocation } from "./definitions.js";
import { collectDocumentLinks } from "./document-links.js";
import { formatDocument } from "./formatter/index.js";
import { findHover } from "./hover.js";
import { collectInlayHints } from "./inlay-hints.js";
import {
    ACTIVE_PARSER_NOTIFICATION,
    type ActiveParserNotificationPayload,
    initializeNotifications,
} from "./notifications/index.js";
import { parseDocument } from "./parser/index.js";
import { getParserAdapterForDocument, supportsDocument } from "./parser/registry.js";
import { findReferenceLocations } from "./references.js";
import { buildRenameWorkspaceEdit, prepareRename } from "./rename.js";
import { initializeCustomRequests } from "./requests/index.js";
import {
    collectSemanticDiagnostics,
    collectSemanticTokens,
    legend as semanticLegend,
} from "./semantic.js";
import { findSignatureHelp } from "./signature-help.js";
import { collectStaticTypecheckDiagnostics } from "./static-typecheck/diagnostics.js";
import { clearStaticTypecheckCache } from "./static-typecheck/service.js";
import { collectDocumentSymbols } from "./symbols.js";
import { setLoggerSink } from "./utils/logger.js";
import { WorkspaceController } from "./workspace/controller.js";
import { removeOpenDocument, updateOpenDocument } from "./workspace/service.js";

export type ClientConfiguration = Partial<InitializationOptions>;

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const workspace = new WorkspaceController();
let supportsWorkspaceFolderChanges = false;

setLoggerSink(connection.console);
initializeNotifications((method, payload) => {
    connection.sendNotification(method, payload);
});
initializeCustomRequests(connection, documents);

async function refreshDiagnostics(uri: string): Promise<void> {
    const document = documents.get(uri);

    if (document === undefined || !supportsDocument(document)) {
        return;
    }

    const documentVersion = document.version;

    const adapter = getParserAdapterForDocument(document);
    if (adapter !== undefined) {
        connection.sendNotification(ACTIVE_PARSER_NOTIFICATION.method, {
            uri: document.uri,
            parserId: adapter.id,
        } satisfies ActiveParserNotificationPayload);
    }

    const syntaxDiagnostics = parseDocument(document).diagnostics;
    const semanticDiagnostics =
        syntaxDiagnostics.length === 0 ? collectSemanticDiagnostics(document) : [];
    const typeDiagnostics =
        syntaxDiagnostics.length === 0 ? await collectStaticTypecheckDiagnostics(document) : [];

    if (!isLatestDocument(uri, documentVersion)) {
        return;
    }

    connection.sendDiagnostics({
        uri: document.uri,
        diagnostics: [...syntaxDiagnostics, ...semanticDiagnostics, ...typeDiagnostics],
    });
}

function isLatestDocument(uri: string, version: number): boolean {
    return documents.get(uri)?.version === version;
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
    const clientConfiguration: Partial<InitializationOptions> = params.initializationOptions || {};
    mergeConfiguration(clientConfiguration);
    connection.console.log(`Language server configuration: ${JSON.stringify(config, null, 4)}`);
    const initialWorkspaceFolderUris =
        params.workspaceFolders?.map((folder) => folder.uri) ??
        (params.rootUri === null || params.rootUri === undefined ? [] : [params.rootUri]);
    workspace.initialize(initialWorkspaceFolderUris);
    supportsWorkspaceFolderChanges = params.capabilities.workspace?.workspaceFolders === true;

    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            documentSymbolProvider: true,
            documentLinkProvider: {
                resolveProvider: false,
            },
            definitionProvider: true,
            referencesProvider: true,
            hoverProvider: true,
            inlayHintProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ["(", ","],
            },
            completionProvider: {
                triggerCharacters: ["$", "."],
            },
            renameProvider: {
                prepareProvider: true,
            },
            semanticTokensProvider: {
                legend: semanticLegend,
                full: true,
            },
            documentFormattingProvider: true,
            ...(supportsWorkspaceFolderChanges
                ? {
                      workspace: {
                          workspaceFolders: {
                              supported: true,
                              changeNotifications: true,
                          },
                      },
                  }
                : {}),
        },
        serverInfo: {
            name: "JSONiq Language Server",
            version: require("../package.json").version,
        },
    };
});

connection.onDocumentSymbol((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return [];
    }

    return collectDocumentSymbols(document);
});

connection.onDocumentLinks((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return [];
    }

    return collectDocumentLinks(document);
});

connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return null;
    }

    return findDefinitionLocation(document, params.position);
});

connection.onReferences(async (params) => {
    await workspace.ready();
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return [];
    }

    return findReferenceLocations(document, params.position, params.context.includeDeclaration);
});

connection.onPrepareRename((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return null;
    }

    return prepareRename(document, params.position);
});

connection.onRenameRequest(async (params) => {
    await workspace.ready();
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return null;
    }

    return buildRenameWorkspaceEdit(document, params.position, params.newName);
});

connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return null;
    }

    return findHover(document, params.position);
});

connection.onSignatureHelp((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return null;
    }

    return findSignatureHelp(document, params.position);
});

connection.languages.inlayHint.on((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return [];
    }

    return collectInlayHints(document, params.range);
});

connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return [];
    }

    return findCompletionsWithTypeInfo(document, params.position);
});

connection.languages.semanticTokens.on((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return { data: [] };
    }

    return collectSemanticTokens(document);
});

connection.onDocumentFormatting((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return [];
    }

    return formatDocument(document);
});

documents.onDidOpen(async (event) => {
    updateOpenDocument(event.document);
    await refreshDiagnostics(event.document.uri);
});

documents.onDidChangeContent(async (event) => {
    updateOpenDocument(event.document);
    await refreshDiagnostics(event.document.uri);
});

documents.onDidClose((event) => {
    removeOpenDocument(event.document.uri);
    clearStaticTypecheckCache(event.document.uri);
    connection.sendDiagnostics({
        uri: event.document.uri,
        diagnostics: [],
    });
});

connection.onDidChangeWatchedFiles((params) => {
    workspace.updateDocuments(params.changes);
});

connection.onInitialized(() => {
    if (!supportsWorkspaceFolderChanges) return;

    connection.workspace.onDidChangeWorkspaceFolders((params) => {
        workspace.updateFolders(
            params.added.map((folder) => folder.uri),
            params.removed.map((folder) => folder.uri),
        );
    });
});

documents.listen(connection);
connection.listen();

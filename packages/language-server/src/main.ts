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
import { DiagnosticService } from "./diagnostics/service.js";
import { collectDocumentLinks } from "./document-links.js";
import { formatDocument } from "./formatter/index.js";
import { findHover } from "./hover.js";
import { collectInlayHints } from "./inlay-hints.js";
import { initializeNotifications } from "./notifications/index.js";
import { supportsDocument } from "./parser/registry.js";
import { findReferenceLocations } from "./references.js";
import { buildRenameWorkspaceEdit, prepareRename } from "./rename.js";
import { initializeCustomRequests } from "./requests/index.js";
import { collectSemanticTokens, legend as semanticLegend } from "./semantic.js";
import { findSignatureHelp } from "./signature-help.js";
import { collectDocumentSymbols } from "./symbols.js";
import { setLoggerSink } from "./utils/logger.js";
import { WorkspaceController } from "./workspace/controller.js";
import { removeOpenDocument, updateOpenDocument } from "./workspace/service.js";

export type ClientConfiguration = Partial<InitializationOptions>;

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const diagnostics = new DiagnosticService(connection, documents);
const workspace = new WorkspaceController(refreshAffectedDocuments);
let semanticTokensRefreshSupported = false;
let inlayHintRefreshSupported = false;
let presentationRefreshRequested = false;
let pendingPresentationRefresh: Promise<void> | undefined;

setLoggerSink(connection.console);
initializeNotifications((method, payload) => {
    connection.sendNotification(method, payload);
});
initializeCustomRequests(connection, documents);

async function refreshAffectedDocuments(
    affected: ReadonlySet<string>,
    refreshPresentation = true,
): Promise<void> {
    if (!(await diagnostics.refreshAffected(affected))) return;
    if (refreshPresentation) await requestPresentationRefresh();
}

async function requestPresentationRefresh(): Promise<void> {
    presentationRefreshRequested = true;
    if (pendingPresentationRefresh !== undefined) return pendingPresentationRefresh;

    pendingPresentationRefresh = (async () => {
        try {
            while (presentationRefreshRequested) {
                presentationRefreshRequested = false;
                await Promise.all([
                    semanticTokensRefreshSupported
                        ? connection.languages.semanticTokens.refresh()
                        : undefined,
                    inlayHintRefreshSupported
                        ? connection.languages.inlayHint.refresh()
                        : undefined,
                ]);
            }
        } finally {
            pendingPresentationRefresh = undefined;
        }
    })();
    return pendingPresentationRefresh;
}

function hasOpenDependent(affected: ReadonlySet<string>, changedUri: string): boolean {
    return [...affected].some((uri) => uri !== changedUri && documents.get(uri) !== undefined);
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
    const clientConfiguration: Partial<InitializationOptions> = params.initializationOptions || {};
    mergeConfiguration(clientConfiguration);
    connection.console.log(`Language server configuration: ${JSON.stringify(config, null, 4)}`);

    semanticTokensRefreshSupported =
        params.capabilities.workspace?.semanticTokens?.refreshSupport === true;
    inlayHintRefreshSupported = params.capabilities.workspace?.inlayHint?.refreshSupport === true;
    const initialWorkspaceFolderUris = params.workspaceFolders?.map((folder) => folder.uri) ?? [];
    workspace.initialize(initialWorkspaceFolderUris);

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
            workspace: {
                workspaceFolders: {
                    supported: true,
                    changeNotifications: true,
                },
            },
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
    const affected = updateOpenDocument(event.document);
    await refreshAffectedDocuments(affected, hasOpenDependent(affected, event.document.uri));
});

documents.onDidChangeContent(async (event) => {
    const affected = updateOpenDocument(event.document);
    await refreshAffectedDocuments(affected, hasOpenDependent(affected, event.document.uri));
});

documents.onDidClose(async (event) => {
    const affected = removeOpenDocument(event.document.uri);
    diagnostics.close(event.document);
    await refreshAffectedDocuments(affected);
});

connection.onDidChangeWatchedFiles((params) => {
    workspace.updateDocuments(params.changes);
});

connection.onInitialized(() => {
    connection.workspace.onDidChangeWorkspaceFolders((params) => {
        workspace.updateFolders(
            params.added.map((folder) => folder.uri),
            params.removed.map((folder) => folder.uri),
        );
    });
});

documents.listen(connection);
connection.listen();

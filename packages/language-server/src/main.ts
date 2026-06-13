import { TextDocument } from "vscode-languageserver-textdocument";
import {
    TextDocumentSyncKind,
    createConnection,
    ProposedFeatures,
    TextDocuments,
    type InitializeParams,
    type InitializeResult,
} from "vscode-languageserver/node";

import { findCompletions } from "./completion.js";
import { findDefinitionLocation } from "./definitions.js";
import { findHover } from "./hover.js";
import { collectInlayHints } from "./inlay-hints.js";
import {
    ACTIVE_PARSER_NOTIFICATION,
    type ActiveParserNotificationPayload,
    initializeCustomNotifications,
} from "./notifications/index.js";
import { parseDocument } from "./parser/index.js";
import { getParserAdapterForDocument, supportsDocument } from "./parser/registry.js";
import { findReferenceLocations } from "./references.js";
import { buildRenameWorkspaceEdit, prepareRename } from "./rename.js";
import {
    collectSemanticDiagnostics,
    collectSemanticTokens,
    legend as semanticLegend,
} from "./semantic.js";
import { findSignatureHelp } from "./signature-help.js";
import { collectStaticTypecheckDiagnostics } from "./static-typecheck/diagnostics.js";
import { clearStaticTypeIndexCache } from "./static-typecheck/index.js";
import { clearStaticTypecheckCache } from "./static-typecheck/service.js";
import { collectDocumentSymbols } from "./symbols.js";
import { setLoggerSink } from "./utils/logger.js";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

setLoggerSink(connection.console);
initializeCustomNotifications(connection);

async function refreshDiagnostics(uri: string): Promise<void> {
    const document = documents.get(uri);

    if (document === undefined || !supportsDocument(document)) {
        return;
    }

    const documentVersion = document.version;

    const adapter = getParserAdapterForDocument(document);
    if (adapter !== undefined) {
        connection.sendNotification(ACTIVE_PARSER_NOTIFICATION, {
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

connection.onInitialize((_params: InitializeParams): InitializeResult => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            documentSymbolProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            hoverProvider: true,
            inlayHintProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ["(", ","],
            },
            completionProvider: {
                triggerCharacters: ["$"],
            },
            renameProvider: {
                prepareProvider: true,
            },
            semanticTokensProvider: {
                legend: semanticLegend,
                full: true,
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

connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return null;
    }

    return findDefinitionLocation(document, params.position);
});

connection.onReferences((params) => {
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

connection.onRenameRequest((params) => {
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

    return findCompletions(document, params.position);
});

connection.languages.semanticTokens.on((params) => {
    const document = documents.get(params.textDocument.uri);

    if (document === undefined || !supportsDocument(document)) {
        return { data: [] };
    }

    return collectSemanticTokens(document);
});

documents.onDidOpen(async (event) => {
    await refreshDiagnostics(event.document.uri);
});

documents.onDidChangeContent(async (event) => {
    await refreshDiagnostics(event.document.uri);
});

documents.onDidClose((event) => {
    clearStaticTypecheckCache(event.document.uri);
    clearStaticTypeIndexCache(event.document.uri);
    connection.sendDiagnostics({
        uri: event.document.uri,
        diagnostics: [],
    });
});

documents.listen(connection);
connection.listen();

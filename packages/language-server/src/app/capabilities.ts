import { TextDocumentSyncKind, type ServerCapabilities } from "vscode-languageserver/node";

import { legend as semanticLegend } from "../semantic.js";

export const serverCapabilities: ServerCapabilities = {
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
};

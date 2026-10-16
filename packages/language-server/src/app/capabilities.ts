import { TextDocumentSyncKind, type ServerCapabilities } from "vscode-languageserver/node";

import { PATH_STEP_TRIGGER_CHARACTERS } from "../lsp/features/completion.js";
import { legend as semanticLegend } from "../lsp/features/semantic-tokens.js";

export const serverCapabilities: ServerCapabilities = {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    codeLensProvider: {
        resolveProvider: false,
    },
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
        triggerCharacters: ["$", ".", "|", ":", ...PATH_STEP_TRIGGER_CHARACTERS],
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

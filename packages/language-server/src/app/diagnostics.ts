import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import { collectStaticTypecheckDiagnostics } from "../lsp/diagnostics/static-typecheck.js";
import {
    ACTIVE_PARSER_NOTIFICATION,
    type ActiveParserNotificationPayload,
} from "../lsp/protocol/notifications/index.js";
import type { ParserService } from "../parser/index.js";
import { getParserAdapterForDocument, supportsDocument } from "../parser/registry.js";
import type { WorkspaceService } from "../workspace/service.js";

export class DiagnosticsManager {
    public constructor(
        private readonly connection: Connection,
        private readonly documents: TextDocuments<TextDocument>,
        private readonly parser: ParserService,
        private readonly workspace: WorkspaceService,
    ) {}

    public async refresh(document: TextDocument): Promise<void> {
        if (!supportsDocument(document)) return;
        this.notifyActiveParser(document);

        const syntaxDiagnostics = this.parser.parse(document).diagnostics;
        const semanticDiagnostics =
            syntaxDiagnostics.length === 0 ? this.workspace.getAnalysis(document).diagnostics : [];
        const typeDiagnostics =
            syntaxDiagnostics.length === 0 ? await collectStaticTypecheckDiagnostics(document) : [];

        this.connection.sendDiagnostics({
            uri: document.uri,
            diagnostics: [...syntaxDiagnostics, ...semanticDiagnostics, ...typeDiagnostics],
        });
    }

    public clear(document: TextDocument): void {
        this.connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    }

    private notifyActiveParser(document: TextDocument): void {
        const adapter = getParserAdapterForDocument(document);
        if (adapter === undefined) return;

        this.connection.sendNotification(ACTIVE_PARSER_NOTIFICATION.method, {
            uri: document.uri,
            parserId: adapter.id,
        } satisfies ActiveParserNotificationPayload);
    }
}

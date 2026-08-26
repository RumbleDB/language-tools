import type { Diagnostic, DocumentUri } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import type { RumbleWrapperClient } from "../integrations/rumble/client.js";
import { collectStaticTypecheckDiagnostics } from "../lsp/diagnostics/static-typecheck.js";
import {
    ACTIVE_PARSER_NOTIFICATION,
    type ActiveParserNotificationPayload,
} from "../lsp/protocol/notifications/index.js";
import type { ParserService } from "../parser/index.js";
import { getParserAdapterForDocument, supportsDocument } from "../parser/registry.js";
import type { WorkspaceService } from "../workspace/service.js";

export class DiagnosticsManager {
    /**
     * Monotonically increasing version per document URI, used to discard
     * stale type-check results when a newer refresh has been triggered.
     */
    private readonly refreshVersions = new Map<DocumentUri, number>();

    public constructor(
        private readonly connection: Connection,
        private readonly documents: TextDocuments<TextDocument>,
        private readonly parser: ParserService,
        private readonly workspace: WorkspaceService,
        private readonly wrapper?: RumbleWrapperClient,
    ) {}

    public async refresh(document: TextDocument): Promise<void> {
        if (!supportsDocument(document)) return;
        this.notifyActiveParser(document);

        const uri = document.uri;
        const refreshVersion = (this.refreshVersions.get(uri) ?? 0) + 1;
        this.refreshVersions.set(uri, refreshVersion);

        const syntaxDiagnostics = this.parser.parse(document).diagnostics;
        const semanticDiagnostics =
            syntaxDiagnostics.length === 0 ? this.workspace.getAnalysis(document).diagnostics : [];
        const fastDiagnostics: Diagnostic[] = [...syntaxDiagnostics, ...semanticDiagnostics];

        // Phase 1: send syntax + semantic diagnostics immediately.
        this.connection.sendDiagnostics({ uri, diagnostics: fastDiagnostics });

        // Phase 2: collect static type-check diagnostics asynchronously and
        // send a combined update — unless a newer refresh has superseded us.
        if (syntaxDiagnostics.length === 0) {
            const typeDiagnostics = await collectStaticTypecheckDiagnostics(document, this.wrapper);
            if (this.refreshVersions.get(uri) !== refreshVersion) return;
            if (typeDiagnostics.length > 0) {
                this.connection.sendDiagnostics({
                    uri,
                    diagnostics: [...fastDiagnostics, ...typeDiagnostics],
                });
            }
        }
    }

    public clear(document: TextDocument): void {
        this.refreshVersions.delete(document.uri);
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

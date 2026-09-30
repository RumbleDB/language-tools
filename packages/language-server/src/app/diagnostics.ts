import type { DocumentUri } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import type { WrapperClient } from "../integrations/rumble/client.js";
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
     * Refresh IDs are unique across document closes and reopens, so an old
     * asynchronous result cannot belong to a new session for the same URI.
     */
    private nextRefreshVersion = 0;
    private readonly refreshVersions = new Map<DocumentUri, number>();

    public constructor(
        private readonly connection: Connection,
        private readonly documents: TextDocuments<TextDocument>,
        private readonly parser: ParserService,
        private readonly workspace: WorkspaceService,
        private readonly wrapper: WrapperClient,
    ) {}

    public async refresh(document: TextDocument): Promise<void> {
        if (!supportsDocument(document)) return;
        this.notifyActiveParser(document);

        const uri = document.uri;
        const refreshVersion = ++this.nextRefreshVersion;
        this.refreshVersions.set(uri, refreshVersion);

        const syntaxDiagnostics = this.parser.parse(document).diagnostics;
        this.connection.sendDiagnostics({ uri, diagnostics: syntaxDiagnostics });
        if (syntaxDiagnostics.length > 0) return;

        const semanticDiagnostics = (await this.workspace.getAnalysis(document)).diagnostics;
        if (this.refreshVersions.get(uri) !== refreshVersion) return;
        this.connection.sendDiagnostics({ uri, diagnostics: [...semanticDiagnostics] });

        const typeDiagnostics = await collectStaticTypecheckDiagnostics(document, this.wrapper);
        if (this.refreshVersions.get(uri) !== refreshVersion) return;
        if (typeDiagnostics.length > 0) {
            this.connection.sendDiagnostics({
                uri,
                diagnostics: [...semanticDiagnostics, ...typeDiagnostics],
            });
        }
    }

    public async refreshOpenDocuments(uris: ReadonlySet<DocumentUri>): Promise<void> {
        for (const uri of uris) {
            const document = this.documents.get(uri);
            if (document !== undefined) await this.refresh(document);
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

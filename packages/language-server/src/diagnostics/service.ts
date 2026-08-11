import { TextDocument } from "vscode-languageserver-textdocument";
import { type Connection, TextDocuments } from "vscode-languageserver/node";

import {
    ACTIVE_PARSER_NOTIFICATION,
    type ActiveParserNotificationPayload,
} from "../notifications/index.js";
import { parseDocument } from "../parser/index.js";
import { getParserAdapterForDocument, supportsDocument } from "../parser/registry.js";
import { collectSemanticDiagnostics } from "../semantic.js";
import { collectStaticTypecheckDiagnostics } from "../static-typecheck/diagnostics.js";
import {
    cancelPendingStaticTypecheck,
    supersedePendingStaticTypecheck,
} from "../static-typecheck/service.js";
import { createDocumentStamp, isDocumentStampCurrent } from "../workspace/service.js";

export class DiagnosticService {
    public constructor(
        private readonly connection: Connection,
        private readonly documents: TextDocuments<TextDocument>,
    ) {}

    public async refreshAffected(affected: ReadonlySet<string>): Promise<boolean> {
        const openUris = [...affected].filter((uri) => this.documents.get(uri) !== undefined);
        if (openUris.length === 0) return false;
        await Promise.all(openUris.map((uri) => this.refresh(uri)));
        return true;
    }

    public async refresh(uri: string): Promise<void> {
        const document = this.documents.get(uri);
        if (document === undefined || !supportsDocument(document)) return;

        const stamp = createDocumentStamp(document);
        supersedePendingStaticTypecheck(stamp);
        const adapter = getParserAdapterForDocument(document);
        if (adapter !== undefined) {
            this.connection.sendNotification(ACTIVE_PARSER_NOTIFICATION.method, {
                uri: document.uri,
                parserId: adapter.id,
            } satisfies ActiveParserNotificationPayload);
        }

        const syntaxDiagnostics = parseDocument(document).diagnostics;
        const semanticDiagnostics =
            syntaxDiagnostics.length === 0 ? collectSemanticDiagnostics(document) : [];
        const typeDiagnostics =
            syntaxDiagnostics.length === 0
                ? await collectStaticTypecheckDiagnostics(document, stamp)
                : [];

        if (!isDocumentStampCurrent(stamp)) return;

        this.connection.sendDiagnostics({
            uri: document.uri,
            version: stamp.documentVersion,
            diagnostics: [...syntaxDiagnostics, ...semanticDiagnostics, ...typeDiagnostics],
        });
    }

    public close(document: TextDocument): void {
        cancelPendingStaticTypecheck(document.uri);
        this.connection.sendDiagnostics({
            uri: document.uri,
            version: document.version,
            diagnostics: [],
        });
    }
}

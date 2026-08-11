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

const DEPENDENT_REFRESH_DEBOUNCE_MS = 250;

export class DiagnosticService {
    private readonly pendingDependentUris = new Set<string>();
    private dependentRefreshTimer: NodeJS.Timeout | undefined;

    public constructor(
        private readonly connection: Connection,
        private readonly documents: TextDocuments<TextDocument>,
    ) {}

    public async refreshAffected(affected: ReadonlySet<string>): Promise<boolean> {
        const openUris = [...affected].filter((uri) => this.documents.get(uri) !== undefined);
        if (openUris.length === 0) return false;
        for (const uri of openUris) this.pendingDependentUris.delete(uri);
        await Promise.all(openUris.map((uri) => this.refresh(uri)));
        return true;
    }

    public scheduleDependentRefresh(affected: ReadonlySet<string>, changedUri: string): void {
        for (const uri of affected) {
            if (uri !== changedUri && this.documents.get(uri) !== undefined) {
                this.pendingDependentUris.add(uri);
            }
        }
        if (this.pendingDependentUris.size === 0) return;

        if (this.dependentRefreshTimer !== undefined) clearTimeout(this.dependentRefreshTimer);
        this.dependentRefreshTimer = setTimeout(() => {
            this.dependentRefreshTimer = undefined;
            this.refreshDependents();
        }, DEPENDENT_REFRESH_DEBOUNCE_MS);
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
        if (!isDocumentStampCurrent(stamp)) return;
        this.connection.sendDiagnostics({
            uri: document.uri,
            version: stamp.documentVersion,
            diagnostics: syntaxDiagnostics,
        });

        if (syntaxDiagnostics.length > 0) {
            /// In case of syntax errors, we do not run semantic or static typecheck diagnostics, as they may be misleading or irrelevant.
            return;
        }

        const semanticDiagnostics = collectSemanticDiagnostics(document);
        const typeDiagnostics = await collectStaticTypecheckDiagnostics(document, stamp);

        if (!isDocumentStampCurrent(stamp)) return;

        this.connection.sendDiagnostics({
            uri: document.uri,
            version: stamp.documentVersion,
            diagnostics: [...syntaxDiagnostics, ...semanticDiagnostics, ...typeDiagnostics],
        });
    }

    public close(document: TextDocument): void {
        this.pendingDependentUris.delete(document.uri);
        cancelPendingStaticTypecheck(document.uri);
        this.connection.sendDiagnostics({
            uri: document.uri,
            version: document.version,
            diagnostics: [],
        });
    }

    private refreshDependents(): void {
        const uris = [...this.pendingDependentUris];
        this.pendingDependentUris.clear();

        for (const uri of uris) {
            const document = this.documents.get(uri);
            if (document === undefined || !supportsDocument(document)) continue;

            const stamp = createDocumentStamp(document);
            supersedePendingStaticTypecheck(stamp);
            const syntaxDiagnostics = parseDocument(document).diagnostics;
            if (!isDocumentStampCurrent(stamp)) continue;

            const semanticDiagnostics =
                syntaxDiagnostics.length === 0 ? collectSemanticDiagnostics(document) : [];
            if (!isDocumentStampCurrent(stamp)) continue;
            this.connection.sendDiagnostics({
                uri,
                version: stamp.documentVersion,
                diagnostics: [...syntaxDiagnostics, ...semanticDiagnostics],
            });
        }
    }
}

import {
    ACTIVE_PARSER_NOTIFICATION,
    type ActiveParserNotificationPayload,
} from "jsoniq-language-server/notifications";
import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

export function registerActiveParserNotification(client: LanguageClient): vscode.Disposable {
    const notificationDisposable = client.onNotification(
        ACTIVE_PARSER_NOTIFICATION,
        async (payload: ActiveParserNotificationPayload) => {
            const document = vscode.workspace.textDocuments.find(
                (doc) => doc.uri.toString() === payload.uri,
            );
            if (document && document.languageId !== payload.parserId) {
                await vscode.languages.setTextDocumentLanguage(document, payload.parserId);
            }
        },
    );

    return notificationDisposable;
}

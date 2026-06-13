import {
    ACTIVE_PARSER_NOTIFICATION,
    type ActiveParserNotificationPayload,
} from "jsoniq-language-server/notifications";
import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

import { JSONIQ_LANGUAGE_ID, XQUERY_LANGUAGE_ID } from "../const";

export function registerActiveParserNotification(client: LanguageClient): vscode.Disposable {
    const notificationDisposable = client.onNotification(
        ACTIVE_PARSER_NOTIFICATION,
        async (payload: ActiveParserNotificationPayload) => {
            const document = vscode.workspace.textDocuments.find(
                (doc) => doc.uri.toString() === payload.uri,
            );
            if (
                document &&
                document.languageId !== payload.parserId &&
                [JSONIQ_LANGUAGE_ID, XQUERY_LANGUAGE_ID].includes(document.languageId)
            ) {
                /// Note: We need to check if the current document is in JSONiq or XQuery before switching.
                // In the case of a Jupyter notebook, the cell itself must stay in the Python language so it can run
                await vscode.languages.setTextDocumentLanguage(document, payload.parserId);
            }
        },
    );

    return notificationDisposable;
}

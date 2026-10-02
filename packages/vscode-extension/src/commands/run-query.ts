import { RUN_QUERY_REQUEST } from "jsoniq-language-server/requests";
import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

import { errorSourceText } from "../source-location.js";
import { ResultsWebviewPanel } from "../views/results-webview.js";

export function registerRunQueryCommand(
    client: LanguageClient,
    context: vscode.ExtensionContext,
): vscode.Disposable {
    return vscode.commands.registerCommand("jsoniq.runQuery", async (targetUri?: vscode.Uri) => {
        const document = targetUri
            ? await vscode.workspace.openTextDocument(targetUri)
            : vscode.window.activeTextEditor?.document;
        if (document === undefined) {
            vscode.window.showWarningMessage("No active document to execute.");
            return;
        }

        const uri = document.uri.toString();
        const queryText = document.getText();
        const startTime = Date.now();

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Executing Query with RumbleDB...",
                cancellable: true,
            },
            async (_, token) => {
                try {
                    const response = await RUN_QUERY_REQUEST.send(
                        client,
                        {
                            uri,
                            query: queryText,
                        },
                        token,
                    );
                    const durationMs = Date.now() - startTime;
                    const timestamp = new Date().toLocaleTimeString();

                    const error = response.error;

                    if (error) {
                        const sourceText = await errorSourceText(
                            error.location,
                            document.uri,
                            queryText,
                        );
                        ResultsWebviewPanel.show(context.extensionUri, {
                            fileUri: uri,
                            error,
                            ...(sourceText !== undefined ? { sourceText } : {}),
                            items: null,
                            durationMs,
                            timestamp,
                        });
                    } else {
                        ResultsWebviewPanel.show(context.extensionUri, {
                            fileUri: uri,
                            items: response.items,
                            durationMs,
                            timestamp,
                        });
                    }
                } catch (error) {
                    const durationMs = Date.now() - startTime;
                    const timestamp = new Date().toLocaleTimeString();
                    const errorMsg = error instanceof Error ? error.message : String(error);

                    ResultsWebviewPanel.show(context.extensionUri, {
                        fileUri: uri,
                        error: { message: errorMsg, code: null, location: null, range: null },
                        items: null,
                        durationMs,
                        timestamp,
                    });
                }
            },
        );
    });
}

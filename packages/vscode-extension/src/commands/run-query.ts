import { RUN_QUERY_REQUEST } from "jsoniq-language-server/requests";
import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

import { ResultsWebviewPanel } from "../views/results-webview.js";

export function registerRunQueryCommand(
    client: LanguageClient,
    context: vscode.ExtensionContext,
): vscode.Disposable {
    return vscode.commands.registerCommand("jsoniq.runQuery", async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor === undefined) {
            vscode.window.showWarningMessage("No active document to execute.");
            return;
        }

        const uri = activeEditor.document.uri.toString();
        const startTime = Date.now();

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Executing Query with RumbleDB...",
                cancellable: false,
            },
            async () => {
                try {
                    const response = await RUN_QUERY_REQUEST.send(client, { uri });
                    const durationMs = Date.now() - startTime;
                    const timestamp = new Date().toLocaleTimeString();

                    const error = response?.error;
                    const output = response?.output;

                    if (typeof error === "string" && error.length > 0) {
                        ResultsWebviewPanel.show(context.extensionUri, {
                            fileUri: activeEditor.document.fileName,
                            error,
                            durationMs,
                            timestamp,
                        });

                        vscode.window.showErrorMessage(`Query execution failed: ${error}`);
                    } else {
                        ResultsWebviewPanel.show(context.extensionUri, {
                            fileUri: activeEditor.document.fileName,
                            output: typeof output === "string" ? output : "(No output returned)",
                            durationMs,
                            timestamp,
                        });
                    }
                } catch (error) {
                    const durationMs = Date.now() - startTime;
                    const timestamp = new Date().toLocaleTimeString();
                    const errorMsg = error instanceof Error ? error.message : String(error);

                    ResultsWebviewPanel.show(context.extensionUri, {
                        fileUri: activeEditor.document.fileName,
                        error: errorMsg,
                        durationMs,
                        timestamp,
                    });

                    vscode.window.showErrorMessage(`Failed to execute query: ${errorMsg}`);
                }
            },
        );
    });
}

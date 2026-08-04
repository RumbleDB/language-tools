import { RUN_QUERY_REQUEST } from "jsoniq-language-server/requests";
import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

export function registerRunQueryCommand(
    client: LanguageClient,
    context: vscode.ExtensionContext,
): vscode.Disposable {
    const outputChannel = vscode.window.createOutputChannel("JSONiq Execution Output");
    context.subscriptions.push(outputChannel);

    return vscode.commands.registerCommand("jsoniq.runQuery", async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor === undefined) {
            vscode.window.showWarningMessage("No active document to execute.");
            return;
        }

        const uri = activeEditor.document.uri.toString();

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Executing Query with RumbleDB...",
                cancellable: false,
            },
            async () => {
                try {
                    const response = await RUN_QUERY_REQUEST.send(client, { uri });

                    outputChannel.clear();
                    outputChannel.appendLine(
                        `--- Query Execution Result [${new Date().toLocaleTimeString()}] ---`,
                    );
                    outputChannel.appendLine(`File: ${activeEditor.document.fileName}`);
                    outputChannel.appendLine("");

                    console.log("Run Query Response:", response);

                    const error = response?.error;
                    const output = response?.output;

                    if (typeof error === "string" && error.length > 0) {
                        outputChannel.appendLine("[ERROR]");
                        outputChannel.appendLine(error);
                        outputChannel.show(true);
                        vscode.window.showErrorMessage(`Query execution failed: ${error}`);
                    } else if (typeof output === "string") {
                        outputChannel.appendLine("[OUTPUT]");
                        outputChannel.appendLine(output);
                        outputChannel.show(true);
                    } else {
                        outputChannel.appendLine("(No output returned)");
                        outputChannel.show(true);
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    outputChannel.clear();
                    outputChannel.appendLine(
                        `--- Execution Error [${new Date().toLocaleTimeString()}] ---`,
                    );
                    outputChannel.appendLine(errorMsg);
                    outputChannel.show(true);
                    vscode.window.showErrorMessage(`Failed to execute query: ${errorMsg}`);
                }
            },
        );
    });
}

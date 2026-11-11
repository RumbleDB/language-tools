import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

const WRAPPER_SECTION = "jsoniq.lsp.wrapper";

/**
 * The server reads the wrapper settings when it starts, so a change asks to restart it. Only one
 * prompt is open at a time, however often the settings are saved.
 */
export function registerRestartPrompt(client: LanguageClient): vscode.Disposable {
    let prompting = false;

    return vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (prompting || !event.affectsConfiguration(WRAPPER_SECTION)) return;

        prompting = true;
        try {
            const choice = await vscode.window.showInformationMessage(
                "JSONiq wrapper settings changed. Restart the language server to apply them.",
                "Restart",
            );
            if (choice === "Restart") await client.restart();
        } finally {
            prompting = false;
        }
    });
}

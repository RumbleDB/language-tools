import * as vscode from "vscode";

import type {
    ExecutionResultData,
    ResultsResponse,
    ResultsRequest,
    OpenErrorLocationRequest,
    OpenRawOutputRequest,
} from "../shared/results-protocol.js";
import { sourceLocationUri } from "../source-location.js";
import { handleResultsMessage } from "./results-message-handler.js";

export class ResultsWebviewPanel {
    private static readonly panels = new Map<string, ResultsWebviewPanel>();
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private readonly fileUri: string;
    private disposables: vscode.Disposable[] = [];
    private data: ExecutionResultData | undefined;
    private running = false;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, fileUri: string) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.fileUri = fileUri;

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        const handlers = {
            openErrorLocation: (message: OpenErrorLocationRequest) =>
                this.openErrorLocation(message),
            openRawOutput: (message: OpenRawOutputRequest) => this.openRawOutput(message),
            rerunQuery: () => this.rerunQuery(),
        };
        this.panel.webview.onDidReceiveMessage(
            (message: ResultsRequest) =>
                handleResultsMessage(message, handlers, (response) => this.postMessage(response)),
            null,
            this.disposables,
        );
    }

    private postMessage(message: ResultsResponse): Thenable<boolean> {
        return this.panel.webview.postMessage(message);
    }

    private async rerunQuery(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.postMessage({ type: "SET_RUNNING", running: true });
            await vscode.commands.executeCommand("jsoniq.runQuery", vscode.Uri.parse(this.fileUri));
        } catch (error) {
            void vscode.window.showErrorMessage(
                `Unable to re-run query: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
            this.running = false;
            await this.postMessage({ type: "SET_RUNNING", running: false });
        }
    }

    private async openErrorLocation(params: OpenErrorLocationRequest): Promise<void> {
        const { location, range } = params;

        const docUri = sourceLocationUri(location);
        const document = await vscode.workspace.openTextDocument(docUri);
        const selection = range
            ? new vscode.Range(
                  range.start.line,
                  range.start.character,
                  range.end.line,
                  range.end.character,
              )
            : new vscode.Range(0, 0, 0, 0);
        await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            preview: false,
            selection,
        });
    }

    private async openRawOutput(params: OpenRawOutputRequest): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument({
                content: params.sequence,
                language: "plaintext",
            });
            await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.One,
                preview: true,
            });
        } catch (error) {
            void vscode.window.showErrorMessage(
                `Unable to open raw output: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    public static show(extensionUri: vscode.Uri, data: ExecutionResultData): void {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;

        const existing = ResultsWebviewPanel.panels.get(data.fileUri);
        if (existing) {
            existing.panel.reveal(undefined, true);
            existing.update(data);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "jsoniqResults",
            `Execution Results - ${vscode.Uri.parse(data.fileUri).path.split("/").pop()}`,
            { viewColumn: column, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist", "webview")],
            },
        );

        const results = new ResultsWebviewPanel(panel, extensionUri, data.fileUri);
        ResultsWebviewPanel.panels.set(data.fileUri, results);
        results.update(data);
    }

    private update(data: ExecutionResultData): void {
        this.data = data;
        if (!this.panel.webview.html) {
            this.panel.webview.html = this.getHtmlForWebview(data);
        } else {
            void this.postMessage({ type: "SET_DATA", data });
        }
    }

    private dispose(): void {
        ResultsWebviewPanel.panels.delete(this.fileUri);
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }

    private getHtmlForWebview(data: ExecutionResultData): string {
        const webview = this.panel.webview;
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "index.js"),
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "index.css"),
        );

        const nonce = getNonce();
        const initialDataJson = JSON.stringify(data).replace(/</g, "\\u003c");

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src ${webview.cspSource} https://fonts.gstatic.com https://fonts.googleapis.com data:; script-src 'nonce-${nonce}' ${webview.cspSource};">
    <link rel="stylesheet" href="${styleUri}">
    <title>Execution Results</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        window.__INITIAL_DATA__ = ${initialDataJson};
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

import * as vscode from "vscode";

export interface ExecutionResultData {
    fileUri: string;
    output?: string;
    error?: string;
    durationMs: number;
    timestamp: string;
}

export class ResultsWebviewPanel {
    public static currentPanel: ResultsWebviewPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this.panel = panel;
        this.extensionUri = extensionUri;

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(extensionUri: vscode.Uri, data: ExecutionResultData): void {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;

        if (ResultsWebviewPanel.currentPanel) {
            ResultsWebviewPanel.currentPanel.panel.reveal(column);
            ResultsWebviewPanel.currentPanel.update(data);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "jsoniqResults",
            `Execution Results - ${data.fileUri}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist", "webview")],
            },
        );

        ResultsWebviewPanel.currentPanel = new ResultsWebviewPanel(panel, extensionUri);
        ResultsWebviewPanel.currentPanel.update(data);
    }

    private update(data: ExecutionResultData): void {
        if (!this.panel.webview.html) {
            this.panel.webview.html = this.getHtmlForWebview(data);
        } else {
            this.panel.webview.postMessage({ type: "SET_DATA", data });
        }
    }

    private dispose(): void {
        ResultsWebviewPanel.currentPanel = undefined;
        this.panel.dispose();
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
        const initialDataJson = JSON.stringify(data);

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src ${webview.cspSource} https://fonts.gstatic.com https://fonts.googleapis.com data:; script-src 'nonce-${nonce}' ${webview.cspSource};">
    <link rel="stylesheet" href="${styleUri}">
    <title>JSONiq Execution Results</title>
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

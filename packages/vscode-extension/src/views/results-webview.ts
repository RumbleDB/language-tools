import * as vscode from "vscode";

import type {
    ExecutionResultData,
    ResultsResponse,
    ResultsRequest,
    ExportResultsRequest,
    OpenErrorLocationRequest,
} from "../shared/results-protocol.js";
import { handleResultsMessage } from "./results-message-handler.js";

export class ResultsWebviewPanel {
    private static readonly panels = new Map<string, ResultsWebviewPanel>();
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private readonly fileUri: string;
    private disposables: vscode.Disposable[] = [];
    private data: ExecutionResultData | undefined;
    private exporting = false;
    private running = false;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, fileUri: string) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.fileUri = fileUri;

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        const handlers = {
            exportResults: (message: ExportResultsRequest) => this.exportResults(message),
            openErrorLocation: (message: OpenErrorLocationRequest) =>
                this.openErrorLocation(message),
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

        let docUri: vscode.Uri;
        if (location.startsWith("file:")) {
            docUri = vscode.Uri.parse(location);
        } else if (/^[a-zA-Z]:[\\/]/.test(location) || location.startsWith("/")) {
            docUri = vscode.Uri.file(location);
        } else {
            try {
                docUri = vscode.Uri.parse(location);
                if (!docUri.scheme) docUri = vscode.Uri.file(location);
            } catch {
                docUri = vscode.Uri.file(location);
            }
        }
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

    public static show(extensionUri: vscode.Uri, data: ExecutionResultData): void {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;

        const existing = ResultsWebviewPanel.panels.get(data.fileUri);
        if (existing) {
            existing.panel.reveal();
            existing.update(data);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "jsoniqResults",
            `Execution Results - ${vscode.Uri.parse(data.fileUri).path.split("/").pop()}`,
            column,
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

    private async exportResults(params: ExportResultsRequest): Promise<void> {
        if (this.exporting) return;
        this.exporting = true;
        try {
            const format = await vscode.window.showQuickPick(
                [
                    { label: "CSV", description: "Table data (.csv)", format: "csv" as const },
                    {
                        label: "Sequence text",
                        description: "Serialized result sequence (.txt)",
                        format: "sequence" as const,
                    },
                ],
                { title: "Export results", placeHolder: "Choose an export format" },
            );
            if (!format) return;
            const extension = format.format === "csv" ? "csv" : "txt";
            const source = this.data?.fileUri;
            const sourceUri = source ? vscode.Uri.parse(source) : undefined;
            const name =
                sourceUri?.path
                    .split("/")
                    .pop()
                    ?.replace(/\.[^/.]+$/, "") || "query";
            const defaultUri =
                sourceUri?.scheme === "file"
                    ? sourceUri.with({
                          path: `${sourceUri.path.slice(0, sourceUri.path.lastIndexOf("/") + 1)}${name}-results.${extension}`,
                      })
                    : undefined;
            const uri = await vscode.window.showSaveDialog({
                saveLabel: "Export results",
                filters:
                    format.format === "csv" ? { CSV: ["csv"] } : { "Result sequence": ["txt"] },
                ...(defaultUri ? { defaultUri } : {}),
            });
            if (!uri) return;
            const content = format.format === "csv" ? params.csv : params.sequence;
            await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
            void vscode.window.showInformationMessage("Results exported.");
        } catch (error) {
            void vscode.window.showErrorMessage(
                `Unable to export results: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
            this.exporting = false;
        }
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

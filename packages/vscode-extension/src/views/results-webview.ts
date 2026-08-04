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
    private disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this.panel = panel;

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
            "JSONiq Execution Results",
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, "assets")],
            },
        );

        ResultsWebviewPanel.currentPanel = new ResultsWebviewPanel(panel);
        ResultsWebviewPanel.currentPanel.update(data);
    }

    private update(data: ExecutionResultData): void {
        this.panel.webview.html = this.getHtmlForWebview(data);
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
        const fileName = data.fileUri.split("/").pop() ?? data.fileUri;
        const isSuccess = !data.error && data.output !== undefined;
        const statusBadgeClass = isSuccess ? "status-success" : "status-error";
        const statusText = isSuccess ? "SUCCESS" : "ERROR";

        const rawPayload = JSON.stringify({
            output: data.output ?? "",
            error: data.error ?? "",
            fileUri: data.fileUri,
            durationMs: data.durationMs,
        });

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSONiq Execution Results</title>
    <!-- Grid.js Styles -->
    <link href="https://cdn.jsdelivr.net/npm/gridjs/dist/theme/mermaid.min.css" rel="stylesheet" />
    <style>
        :root {
            --bg-color: var(--vscode-editor-background, #1e1e1e);
            --fg-color: var(--vscode-editor-foreground, #d4d4d4);
            --border-color: var(--vscode-panel-border, #333);
            --card-bg: var(--vscode-editorWidget-background, #252526);
            --accent-green: #2ecc71;
            --accent-red: #e74c3c;
            --button-bg: var(--vscode-button-background, #0e639c);
            --button-fg: var(--vscode-button-foreground, #ffffff);
            --button-hover: var(--vscode-button-hoverBackground, #1177bb);
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
            background-color: var(--bg-color);
            color: var(--fg-color);
            padding: 16px;
            margin: 0;
            box-sizing: border-box;
        }

        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 10px;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .title {
            font-size: 16px;
            font-weight: 600;
        }

        .badge {
            font-size: 11px;
            font-weight: bold;
            padding: 3px 8px;
            border-radius: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status-success {
            background-color: rgba(46, 204, 113, 0.2);
            color: var(--accent-green);
            border: 1px solid var(--accent-green);
        }

        .status-error {
            background-color: rgba(231, 76, 60, 0.2);
            color: var(--accent-red);
            border: 1px solid var(--accent-red);
        }

        .meta-pill {
            font-size: 12px;
            background: var(--card-bg);
            padding: 4px 10px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
            color: var(--fg-color);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .controls {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }

        .action-btn {
            background: var(--card-bg);
            color: var(--fg-color);
            border: 1px solid var(--border-color);
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .action-btn:hover {
            background: var(--button-hover);
            color: #fff;
        }

        .view-container {
            width: 100%;
        }

        /* Grid.js Custom Styling for VS Code Theme */
        .gridjs-container {
            color: var(--fg-color) !important;
            background-color: transparent !important;
        }

        .gridjs-wrapper {
            border: 1px solid var(--border-color) !important;
            border-radius: 6px !important;
            box-shadow: none !important;
            background-color: var(--card-bg) !important;
        }

        .gridjs-table {
            background-color: var(--card-bg) !important;
            width: 100% !important;
        }

        .gridjs-th {
            background-color: rgba(255, 255, 255, 0.05) !important;
            color: var(--fg-color) !important;
            border-bottom: 1px solid var(--border-color) !important;
            font-weight: 600 !important;
            font-size: 12px !important;
            white-space: nowrap !important;
        }

        .gridjs-th-content {
            white-space: nowrap !important;
            overflow: visible !important;
        }

        .gridjs-td {
            background-color: var(--card-bg) !important;
            color: var(--fg-color) !important;
            border-bottom: 1px solid var(--border-color) !important;
            font-size: 12px !important;
            white-space: pre-wrap !important;
            font-family: var(--vscode-editor-font-family, monospace) !important;
        }

        .gridjs-input {
            background-color: var(--card-bg) !important;
            color: var(--fg-color) !important;
            border: 1px solid var(--border-color) !important;
            border-radius: 4px !important;
            font-size: 12px !important;
            padding: 6px 10px !important;
        }

        .gridjs-footer {
            background-color: var(--card-bg) !important;
            border-top: 1px solid var(--border-color) !important;
            color: var(--fg-color) !important;
        }

        .gridjs-pagination .gridjs-pages button {
            background-color: var(--card-bg) !important;
            color: var(--fg-color) !important;
            border: 1px solid var(--border-color) !important;
        }

        .gridjs-pagination .gridjs-pages button.gridjs-currentPage {
            background-color: var(--button-bg) !important;
            color: var(--button-fg) !important;
        }

        .error-box {
            background-color: rgba(231, 76, 60, 0.1);
            border: 1px solid var(--accent-red);
            color: var(--accent-red);
            padding: 14px;
            border-radius: 6px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <span class="title">📄 ${fileName}</span>
            <span class="badge ${statusBadgeClass}">${statusText}</span>
        </div>
        <div class="header-left">
            <span class="meta-pill">⚡ ${data.durationMs}ms</span>
            <span class="meta-pill">🕒 ${data.timestamp}</span>
            <button class="action-btn" onclick="copyOutput()">📋 Copy Output</button>
        </div>
    </div>

    <div id="tableView" class="view-container">
        <div id="gridWrapper"></div>
    </div>

    <!-- Grid.js JS -->
    <script src="https://cdn.jsdelivr.net/npm/gridjs/dist/gridjs.umd.js"></script>
    <script>
        const payload = ${rawPayload};

        function copyOutput() {
            const content = payload.output || payload.error;
            navigator.clipboard.writeText(content);
        }

        function initGrid() {
            if (!payload.output || payload.error) {
                document.getElementById("gridWrapper").innerHTML = "<div class='error-box'>" + (payload.error || "No output returned") + "</div>";
                return;
            }

            const rawText = payload.output.trim();
            if (rawText.length === 0) {
                document.getElementById("gridWrapper").innerHTML = "<div class='meta-pill'>Sequence is empty ()</div>";
                return;
            }

            let items = [];
            try {
                const parsed = JSON.parse(rawText);
                if (Array.isArray(parsed)) {
                    items = parsed;
                } else {
                    items = [parsed];
                }
            } catch (e) {
                const lines = rawText.split("\\n");
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        items.push(JSON.parse(trimmed));
                    } catch (err) {
                        items.push(line);
                    }
                }
            }

            const allObjects = items.length > 0 && items.every(it => typeof it === "object" && it !== null && !Array.isArray(it));

            let columns = [];
            let data = [];

            if (allObjects) {
                const keySet = new Set();
                items.forEach(it => Object.keys(it).forEach(k => keySet.add(k)));
                const keys = Array.from(keySet);

                columns = ["#", ...keys];
                data = items.map((it, idx) => {
                    const row = [(idx + 1)];
                    keys.forEach(k => {
                        const val = it[k];
                        row.push(val !== undefined && val !== null ? (typeof val === "object" ? JSON.stringify(val) : (val)) : "");
                    });
                    return row;
                });
            } else {
                columns = ["#", "value"];
                data = items.map((it, idx) => [
                    (idx + 1),
                    typeof it === "object" ? JSON.stringify(it) : (it)
                ]);
            }

            new gridjs.Grid({
                columns: columns,
                data: data,
                search: true,
                sort: true,
                autoWidth: true,
                pagination: {
                    limit: 15
                },
                style: {
                    table: { 'font-size': '12px' },
                    th: { 'white-space': 'nowrap' }
                }
            }).render(document.getElementById("gridWrapper"));
        }

        initGrid();
    </script>
</body>
</html>`;
    }
}

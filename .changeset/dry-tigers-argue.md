---
"rumble-lsp-wrapper": minor
"jsoniq-vscode": minor
"jsoniq-language-server": minor
---

Introduce full query execution support for JSONiq and XQuery files powered by RumbleDB, allowing users to run queries directly within VS Code and view formatted results in a side-by-side webview panel.

The Java LSP wrapper now includes a dedicated `RunQuery` handler that executes JSONiq/XQuery scripts against the RumbleDB query engine and serializes execution results as structured JSON arrays.

The Language Server protocol layer adds custom `runQuery` request handlers, protocol interfaces, and client execution helpers to bridge query execution requests between the editor client and the underlying Java wrapper process.

The VS Code extension registers the `jsoniq.runQuery` command in editor context menus and title bars. It creates a new webview panel to display query results in a structured table format, powered by the new `@jsoniq/results-ui` webview package built with SolidJS and TanStack Table.

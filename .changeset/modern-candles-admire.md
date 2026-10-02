---
"jsoniq-language-server": minor
"jsoniq-vscode": minor
"rumble-lsp-wrapper": minor
---

Refactor query execution and results presentation across the stack:

- **Rumble LSP Wrapper**: Return structured `QueryResultItem` objects preserving item type metadata (atomic, object, array, XML) in query responses.
- **Language Server**: Support typed query result items in the `jsoniq/runQuery` LSP protocol.
- **VS Code Extension & Results UI**:
    - Improve Results UI with structured sequence and item presentation, including expandable nested objects and XML rendering.
    - Simplify UI layout by consolidating execution metadata, copy, and export actions into the header bar.
    - Clean up footer to focus strictly on pagination controls.
    - Establish a type-safe message protocol between the results webview and the extension host.

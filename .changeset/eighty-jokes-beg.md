---
"jsoniq-language-server": minor
"jsoniq-vscode": minor
"rumble-lsp-wrapper": minor
---

refactor: make query result data model more structured by using discriminated unions and required properties for each item kind, and adapt the VS Code list and table views to the new API.

The exported `RunQueryItem` type is now a discriminated union with required properties for each item kind. Clients consuming `jsoniq/runQuery` results must update for these breaking payload changes:

- Type metadata is grouped under `type.displayName` and optional `type.qname`, replacing the string `type` and top-level `typeName`.
- Objects expose `fields` containing literal `name` and sequence-valued `value` properties. Maps retain `entries` with typed atomic keys, including null keys, and sequence-valued values.
- Arrays require `members`, preserving empty and multi-item member sequences. Nodes require `nodeKind`.
- Functions expose `name`, `arity`, and `signature` directly instead of nesting them under `function`.
- `lexicalValue` is removed. Use `serialized` for value text, previews, copying, and exports, and object field names directly when projecting table columns.

The backend separates item conversion from the result model and preserves runtime maps even when their contents resemble objects. Fallback query responses now contain a structured error instead of returning both `items` and `error` as null. The response envelope remains `{ items, error }`.

The webview renders the new item variants, uses qualified type names for value colors, preserves literal object field names in table projection, and displays expanded function signatures once.

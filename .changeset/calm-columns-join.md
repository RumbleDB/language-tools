---
"rumble-lsp-wrapper": minor
"jsoniq-language-server": minor
"jsoniq-vscode": minor
---

feat(run-query): report the engine-computed `itemType` of query results and use it for table column headers

**Breaking:** object type `fields` now map each name to `{ type, required }` instead of a type, so optional fields are marked (shown as `name?: type`).

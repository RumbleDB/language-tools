---
"jsoniq-language-server": minor
"jsoniq-vscode": minor
"rumble-lsp-wrapper": minor
---

feat(diagnostics): show a static type error as an error when the code always fails, such as `1 + "a"`, and as a warning when it fails only for some values, such as an `item*` argument passed as an `xs:integer`

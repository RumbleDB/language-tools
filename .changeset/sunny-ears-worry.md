---
"rumble-lsp-wrapper": minor
"jsoniq-language-server": minor
---

Add type declaration and resolution support to the language server. Types are no longer treated as strings, but rather as structured objects with a QName. The LSP wrapper has been updated to reflect this change. Undo the change to the smaller .jar build in the LSP wrapper because it was causing a `ClassNotFoundException`.

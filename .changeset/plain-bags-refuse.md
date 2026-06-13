---
"jsoniq-vscode": minor
"jsoniq-language-server": minor
---

Add a configuration that can enable or disable the LSP wrapper dynamically.

Add more checks to ensure that, if the wrapper fails to start (e.g., if Java is unavailable), the language server itself can continue to work and bypass the failure.

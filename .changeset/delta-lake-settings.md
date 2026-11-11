---
"jsoniq-language-server": minor
"jsoniq-vscode": minor
---

Add the `jsoniq.lsp.wrapper.lakehouseFormats` setting, whose `delta` checkbox lets the RumbleDB wrapper read Delta Lake tables with `delta-file()` and `table()`, and the `jsoniq.lsp.wrapper.sparkConf` setting for any other Spark property. Changing a wrapper setting now asks to restart the language server instead of needing a window reload.

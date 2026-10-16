---
"rumble-lsp-wrapper": patch
"jsoniq-language-server": patch
"jsoniq-vscode": patch
---

fix(results): sort numeric table columns by value, so `1.5` sorts after `1.25` and negative numbers sort before positive ones; query results report the exact lexical value of numeric items as `number`

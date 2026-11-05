---
"jsoniq-language-server": patch
"jsoniq-vscode": patch
---

fix(completion): accepting a completion item replaces the name being edited, so that `c` at `$a.|test` gives `$a.c` rather than `$a.ctest`. Items offer both insert and replace edits, and `editor.suggest.insertMode` now defaults to `replace` for JSONiq and XQuery

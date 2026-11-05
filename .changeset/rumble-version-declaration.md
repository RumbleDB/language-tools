---
"jsoniq-language-server": minor
"jsoniq-vscode": minor
"rumble-lsp-wrapper": minor
---

feat: upgrade RumbleDB to https://github.com/RumbleDB/rumble/commit/a22ce55ae2935f43254d8b4c7f0f6a0342a1d54e and sync its grammar changes

See https://github.com/RumbleDB/rumble/pull/2063

Only a version declaration at the start of a module now selects the language, not the same text in a string or comment. `jsoniq encoding "..."` and `xquery encoding "..."` are accepted, and the formatter reads them from the shared `versionDecl` rule.

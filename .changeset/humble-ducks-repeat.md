---
"rumble-lsp-wrapper": minor
"jsoniq-language-server": minor
---

Pre-generate builtin functions JSON file and save it to `assets` folder.

These functions are always the same for each version of the language server. Pre-generating them saves runtime and makes the wrapper solely responsible for static type checking, which is optional.

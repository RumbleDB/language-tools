---
"jsoniq-language-server": patch
"rumble-lsp-wrapper": patch
---

fix: keep the bindings of `some` and `every` expressions while their `satisfies` part is still missing, so that later bindings can use the earlier ones in hover and completion

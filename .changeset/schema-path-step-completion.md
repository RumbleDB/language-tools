---
"rumble-lsp-wrapper": minor
"jsoniq-language-server": minor
"jsoniq-vscode": minor
---

feat(completion): suggest the child elements and attributes that the XML Schema declares in schema-typed paths, with the type each step selects, attributes labelled with `@` (e.g. `@id`): after `/`, below each descendant after `//`, and for the context item inside predicates (e.g. `$order/o:item[o:pr`) and on the right of `!`; they are ranked before other suggestions, such as functions like `data()`, which may also follow `/`, and they appear as soon as `/`, `@` or `[` is typed

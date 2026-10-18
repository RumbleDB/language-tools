---
"rumble-lsp-wrapper": minor
"jsoniq-language-server": minor
---

feat(completion): suggest the child elements and attributes that the XML Schema declares in schema-typed paths, with the type each step selects: after `/` and `/@`, below each descendant after `//` and `//@`, and for the context item inside predicates (e.g. `$order/o:item[o:pr`) and on the right of `!`; they are ranked before other suggestions, such as functions like `data()`, which may also follow `/`, and attributes appear as soon as `@` is typed

---
"rumble-lsp-wrapper": minor
"jsoniq-language-server": minor
---

Report every static type error in a document instead of only the first one, including type errors after a syntax error. Errors caused by another error, such as using a variable whose value has a type error, are not reported again. A static type error that always occurs, such as `1 + "a"`, is shown as an error, and one that only occurs for some values, such as an `item*` argument for an `xs:integer` parameter, as a warning; all were warnings before. The variables of a `copy` clause are typed by the kind of their source.

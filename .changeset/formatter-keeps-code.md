---
"jsoniq-language-server": patch
---

The formatter no longer changes what a query means or drops its comments:

- It keeps `()` as a sequence type in JSONiq (`$x treat as ()`), which it deleted.
- It keeps the `collation` of a `group by` variable, the default value of an `external` variable, and the `map` keyword of a `map { … }` constructor.
- It keeps a comment after a comma in a parenthesized sequence or a `{| … |}` constructor, such as one ending each line of `( … )`.
- A comment on its own line stays on its own line, so formatting a document again no longer moves it.
- When a comment cannot be placed, the document is left as it is instead of losing the comment.

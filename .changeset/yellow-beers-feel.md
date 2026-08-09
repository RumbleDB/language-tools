---
"jsoniq-language-server": minor
---

Adds a new Wadler-style formatter for JSONiq and XQuery.

It formats core queries, declarations, expressions, collections, scripting statements, and direct XML constructors with configurable indentation and line width. It preserves comments and whitespace-sensitive content such as XML text and string constructors.

The formatter only runs on valid documents and is covered by parse, idempotence, and regression tests.

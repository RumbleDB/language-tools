---
"jsoniq-language-server": minor
"rumble-lsp-wrapper": minor
---

Variable completion shows the type that RumbleDB infers for each variable, such as `xs:integer` or `object{id, items, …}`, instead of only "Variable" or "Parameter". The types come from the static typecheck that diagnostics already run, so a valid document is not compiled again. Completion waits up to 200 ms for RumbleDB to check the document, which takes milliseconds once RumbleDB runs. When it takes longer, as just after it starts, completion shows the kinds of the variables, and the editor asks again as the user types.

The wrapper's `static-typecheck` response also lists the types of the variables that the query binds, even when the query has errors.

---
"jsoniq-language-server": minor
"rumble-lsp-wrapper": minor
---

Variable completion shows the type that RumbleDB infers for each variable, such as `xs:integer` or `object{id, items, …}`, instead of only "Variable" or "Parameter". Completion does not wait for RumbleDB: it shows the types from the last version of the document that RumbleDB has checked, and asks it to check the current one. The types come from the static typecheck that diagnostics already run, so a valid document is not compiled again. A variable that RumbleDB has not typed yet is still labelled with its kind.

The wrapper's `static-typecheck` response also lists the types of the variables that the query binds, even when the query has errors.

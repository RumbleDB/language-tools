---
"jsoniq-language-server": minor
---

Synced the JSONiq and XQuery grammars with RumbleDB, changing declaration sites to use `varBinding` so it's easier to distinguish between variable declaration and reference.

Unified analysis variable definitions under a single variable kind, removing `declaration-kind` branching.

Moved the definition of `visibleFrom` into the parser AST for more precise definition visibility.

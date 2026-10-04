---
"jsoniq-language-server": minor
"rumble-lsp-wrapper": minor
---

refacrtor: shared type descriptor for static inference and runtime query results, exposing type kind and structure alongside the existing display name and expanded QName metadata

Represent type kinds with discriminated variants. Named descriptors require a QName, while anonymous types retain their structure or use an opaque descriptor with the engine display text.

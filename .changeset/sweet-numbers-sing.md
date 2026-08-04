---
"rumble-lsp-wrapper": minor
"jsoniq-language-server": minor
---

Replace the legacy static type index, which is carried with the `static-typecheck` request, with on-demand type queries via `type-at-position`. In the language server (packages/language-server), the full-document type table caching and indexing files (index.ts, key.ts, and format.ts) were removed and the hover.ts file was simplified to dynamically fetch types per position.

In the Java wrapper (packages/rumble-lsp-wrapper), `StaticTypeChecker.java` was modified to **focus strictly on error diagnostics** rather than building whole-document type maps. Meanwhile, `TypeAtPosition.java` was modified to resolve types and AST ranges dynamically. It has also been refactored to use a `AbstractNodeVisitor` for cleaner traversal of the AST and allow for future extensibility.

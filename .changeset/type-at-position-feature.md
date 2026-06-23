---
"jsoniq-language-server": minor
"rumble-lsp-wrapper": minor
---

Implement `type-at-position` request in the LSP wrapper, which returns the type of the **expression** at a given position in the document. The response includes the sequence type and the range of the expression.

It has been integrated into the `hover` request, so that hovering over an expression will show its type.

This change requires this pull request of RumbleDB to be merged first: https://github.com/RumbleDB/rumble/pull/1536

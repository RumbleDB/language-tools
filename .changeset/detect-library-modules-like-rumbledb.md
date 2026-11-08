---
"rumble-lsp-wrapper": patch
---

Fix "Main module expected, but library module found" on library modules that start with a comment between `module` and `namespace`, a comment after the version declaration, or an `xquery encoding` declaration without a version.

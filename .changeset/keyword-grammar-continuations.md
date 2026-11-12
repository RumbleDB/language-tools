---
"jsoniq-language-server": patch
---

Complete grammar keywords after declarations, imports, validation, and update-expression introducers in JSONiq and XQuery, such as `module` and `schema` after `import`. Keep compound suggestions such as `order by` specific to their syntax context. Where an expression can start, also offer the update expressions `copy`, `delete`, `insert`, `rename`, `replace` and `append`. Offer no query completion in literal XML text and attribute values.

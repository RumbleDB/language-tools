---
"rumble-lsp-wrapper": minor
"jsoniq-language-server": minor
"jsoniq-vscode": minor
---

feat: upgrade RumbleDB to https://github.com/RumbleDB/rumble/commit/4f5981f66d040978b169a948d7e198c00fe30a88 for static typing of schema-validated XML: `validate` results, child, attribute and descendant steps, and their atomized values get their XML Schema types, and steps that the schema does not declare are reported as errors (XPST0005) with the names it does declare (e.g. `The schema declares no child element o:prices for schema-element(o:order). It declares o:price.`)

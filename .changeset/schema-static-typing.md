---
"rumble-lsp-wrapper": minor
"jsoniq-language-server": minor
---

feat: upgrade RumbleDB to https://github.com/RumbleDB/rumble/commit/d384508274007702382ad3a977d72f5557c41944 for static typing of schema-validated XML: `validate` results, child, attribute and descendant steps, and their atomized values get their XML Schema types, and steps that the schema does not declare are reported as errors (XPST0005) with the names it does declare (e.g. `The schema declares no child element o:prices for schema-element(o:order). It declares o:price.`)

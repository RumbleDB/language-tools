---
"jsoniq-language-server": minor
---

Add XQuery grammar support to the language server. The parser will activate if any of the following conditions are met (see `parser/xquery/index.ts`).

1. The language ID is `xquery`.
2. The document includes the string `xquery version`.
3. The file extension is `.xq`, `.xqy`, or `.xquery`.

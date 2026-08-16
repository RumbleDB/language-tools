---
"jsoniq-language-server": minor
---

feat: load W3C XQuery and XPath error code into the language server and provide information about them in completion.

Old `catchVar` has been removed from the parser grammar, because it was not part of the W3C XQuery and XPath specification and never used.

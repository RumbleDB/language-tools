---
"rumble-lsp-wrapper": minor
"jsoniq-language-server": minor
---

add QName support to language server

Previously, the language server resolved names based on the prefix and local name, which could lead to incorrect resolutions in cases where the same local name was used with different prefixes. With the addition of QName support, the language server can now correctly resolve names based on the full qualified name, ensuring accurate name resolution even in cases where multiple prefixes are used. For example:

```jsoniq
declare namespace aliasfn = "http://www.w3.org/2005/xpath-functions";
let $a := aliasfn:local-name-from-QName(aliasfn:QName('https://example.com', 'test'))
return $a
```

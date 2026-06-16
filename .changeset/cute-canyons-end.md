---
"jsoniq-language-server": patch
---

fix: add support for URI-qualified QNames and enhance related tests

Previously, URI-qualified QNames had the namespace URi removed in the parser layer. It was not resolving the following function name correctly:

```jsoniq
Q{http://www.example.com}count(())                      (: Should give error but was not :)
Q{http://www.w3.org/2005/xpath-functions}count(())      (: Should resolve correctly :)
```

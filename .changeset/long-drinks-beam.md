---
"jsoniq-language-server": minor
---

fix: built-in types were not resolved correctly.

Added semantic resolution for built-in JSONiq types in the language server. Built-in functions and types now share a single kind-aware resolver, and built-in type definitions participate in the analysis model alongside source definitions.

Unprefixed type names are resolved through ordered default, JSONiq, and XML Schema namespaces, consistent with built-in function resolution. This prevents valid types such as xs:string, string, item, and array from being reported as undefined.

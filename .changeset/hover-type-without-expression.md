---
"jsoniq-language-server": patch
---

Hover shows the type of an expression without repeating its source text, which the editor already highlights. A variable is still shown as `$x as xs:integer`, and a declared function as `local:f($v) as xs:integer`.

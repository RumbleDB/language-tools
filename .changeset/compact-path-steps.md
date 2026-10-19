---
"jsoniq-language-server": patch
---

fix(formatter): write path steps and type tests without inner spaces, such as `$doc/book[@id = 1]/child::title` and `element(a, xs:string)`, which were formatted as `$doc / book [@ id = 1] / child : : title` and `element ( a , xs:string )`

---
"jsoniq-language-server": patch
---

fix(completion): suggest variables and object fields inside function call arguments, such as `$a` in `fn:abs($)`, where only functions were offered

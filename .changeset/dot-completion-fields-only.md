---
"jsoniq-language-server": patch
---

After an object lookup dot, such as `$o.`, completion offers only the object's fields instead of also every variable in scope. Variables are still offered once a `$` is typed, as in `$o.$key`.

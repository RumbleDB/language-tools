---
"jsoniq-language-server": patch
---

fix: stop reporting the context item (`$$` in JSONiq, `.` in XQuery) as an undefined variable; inside predicates, simple maps, path steps and function bodies it no longer links to `declare context item`, it cannot be renamed, and JSONiq variable completion offers `$$`

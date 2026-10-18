---
"jsoniq-language-server": patch
---

fix: after a prefix such as `fn:`, collect completion candidates where the name starts, so functions are only suggested where the grammar allows a function call and no longer in `catch` targets such as `catch err:`

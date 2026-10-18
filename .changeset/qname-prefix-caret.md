---
"jsoniq-language-server": patch
---

fix: when the cursor is at the end of a name or keyword, collect completion candidates where the word starts, so a keyword typed in full (such as `order`, offering `order by`) is still suggested; after a prefix such as `fn:`, functions are only suggested where the grammar allows a function call and no longer in `catch` targets such as `catch err:`

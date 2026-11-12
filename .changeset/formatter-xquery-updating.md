---
"jsoniq-language-server": patch
---

The formatter keeps the `updating` annotation of an XQuery function, which it printed as `%`: `declare updating function` became `declare % function`.

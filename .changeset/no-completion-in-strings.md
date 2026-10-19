---
"jsoniq-language-server": patch
---

fix(completion): suggest nothing inside string literals and comments, where keywords were offered because they may contain any token, such as a `.` typed in a domain name or a sentence

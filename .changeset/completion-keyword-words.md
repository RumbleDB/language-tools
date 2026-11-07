---
"jsoniq-language-server": patch
---

fix(completion): accepting a multi-word operator replaces the words already written, so that `instan|ce of` gives `instance of` rather than `instance of of`, and a comment or spacing between the words is kept

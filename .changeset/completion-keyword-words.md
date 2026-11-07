---
"jsoniq-language-server": patch
---

fix(completion): accepting a multi-word operator replaces the words already written, so that `instan|ce of` gives `instance of` rather than `instance of of`, and accepting a multi-word keyword no longer deletes a comment between its words

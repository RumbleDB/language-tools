---
"jsoniq-language-server": patch
---

fix(completion): accepting a completion item replaces the name being edited, so that `c` at `$a.|test` gives `$a.c` rather than `$a.ctest`. A function replacing a name before existing arguments only inserts its name, so that the call keeps them

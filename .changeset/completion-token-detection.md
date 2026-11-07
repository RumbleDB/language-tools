---
"jsoniq-language-server": patch
---

fix(completion): suggest object fields when whitespace or a comment follows the dot, as in `$a.` at the end of a line. Accepting an item now finds what it replaces from tokens rather than the text, so it replaces all of `err:*`, the name after `$a/|`, the rest of a multi-word keyword such as `or|der by`, and a dotted XQuery name, and a function keeps arguments that follow a comment.

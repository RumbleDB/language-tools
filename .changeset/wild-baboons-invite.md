---
"jsoniq-language-server": minor
---

refactor: classify definitions into `source`, `implicit` and `builtin`

$err variable in catch blocks are implicit, but not builtin (it's still scope), this caused some problems with hover functionality (it was considering the whole catch block as selectionRange of the $err variable, which is not correct). Now, the hover functionality works correctly for $err variable in catch blocks.

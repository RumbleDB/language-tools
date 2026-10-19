---
"jsoniq-language-server": patch
---

fix(completion): suggest object fields when an enclosing expression ends at the dot, as in `if ($c) then 1 else $o.` or `1, $o.`

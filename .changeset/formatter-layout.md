---
"jsoniq-language-server": patch
---

The formatter keeps the spacing of constructs it has no layout for, instead of putting a space between all their parts: `import module namespace m = "m.jq";`, `concat#2`, `-1`, `"a" => upper-case()` and `function($x)` are no longer printed as `"m.jq" ;`, `concat # 2`, `- 1`, `upper-case ()` and `function ( $x )`. Binary operators, such as `+`, `and` and `||`, are spaced, and a long chain of them breaks before an operator rather than inside a function call. A comment on its own line no longer makes the code after it break.

---
"jsoniq-language-server": patch
---

The formatter keeps the spacing of constructs it has no layout for, instead of putting a space between all their parts: `import module namespace m = "m.jq";`, `concat#2`, `-1`, `"a" => upper-case()` and `function($x)` are no longer printed as `"m.jq" ;`, `concat # 2`, `- 1`, `upper-case ()` and `function ( $x )`. Binary operators, such as `+`, `and` and `||`, are spaced, and a long chain of them breaks before an operator rather than inside a function call. A comment on its own line no longer makes the code after it break.

An object no longer expands just because it has more than two fields: it stays on one line when it fits, unless it is written with a line break after `{`. A function body written on its own lines stays on its own lines.

A FLWOR expression bound to a variable or returned by another FLWOR starts on its own line, indented, so its `return` is no longer aligned with that of the enclosing FLWOR. The start and end conditions of a `for tumbling window` or `for sliding window` clause are on lines of their own, instead of one long line.

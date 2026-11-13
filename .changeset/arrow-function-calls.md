---
"jsoniq-language-server": patch
---

Treat the function after an arrow (`=>`) as a call that receives the left operand as its first argument, as XQuery 3.1 defines it: `$x => f(1)` calls `f($x, 1)`. Go to definition, hover, references and rename now work on the function name after `=>`; renaming a function used to leave its arrow uses unchanged. An arrow to an undefined function, or with the wrong number of arguments, is now reported. Signature help starts at the second parameter, and file paths complete in the operand of `"data.json" => json-lines()`. Signature help writes an arrow step's signature the way it is called, `$sourceString => substring($start)`, and an inlay hint before the function name names the parameter the expression before `=>` fills (`$s => $input: tokenize(",")`), with that expression as its tooltip.

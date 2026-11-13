---
"jsoniq-language-server": patch
---

Treat the function after an arrow (`=>`) as a call that receives the left operand as its first argument, as XQuery 3.1 defines it: `$x => f(1)` calls `f($x, 1)`.

- Go to definition, hover, references and rename now work on the function name after `=>`. Renaming a function used to leave its arrow uses unchanged.
- An arrow to an undefined function, or with the wrong number of arguments, is now reported.
- Signature help writes an arrow step the way it is called, `$sourceString => substring($start)`, and starts at the second parameter. Hover on the name says which parameter the operand fills.
- Completing a function name after `=>` inserts the call without the parameter the operand fills, and leaves out functions without parameters.
- File paths complete in the operand of `"data.json" => json-lines()`.
- Completing `concat` inserts two arguments instead of a literal `$...` placeholder.

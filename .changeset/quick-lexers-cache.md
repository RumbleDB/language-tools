---
"jsoniq-language-server": minor
"jsoniq-vscode": minor
"rumble-lsp-wrapper": minor
---

perf: upgrade RumbleDB to https://github.com/RumbleDB/rumble/commit/a8689ea135abc1670c2d1a7a42e90817dcd06688, which moves the `EXIT_INTERPOLATION` lexer predicate to the end of the rule; type checking of a 1,000-line query is about 8 times faster

---
"jsoniq-language-server": patch
"jsoniq-vscode": patch
---

perf(parser): move EXIT_INTERPOLATION predicate to the right edge of the rule

A semantic predicate at the start of a default-mode lexer rule is reachable from the lexer's start state, so **ANTLR never caches that state and recomputes it for every token**.

Evaluating the predicate after RBRACE GRAVE keeps the same behavior and lets the DFA cache the start state. Diagnostics on a generated file of 40 functions drop from 364 ms to 9 ms.

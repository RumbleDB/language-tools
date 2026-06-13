---
"jsoniq-language-server": patch
---

fix language server being unresponsive with XQuery parser.

The problem comes from string rules in XQuery grammar file (JSONiq grammar file does not have this problem). Language server is frozen generating completion items during `antlr4-c3.collectCandidates()` call, because the latest XQuery grammar tokenizes string content one character at a time as default-channel `ContentChar`, then gives c3 ambiguous ways to consume the same run of characters.

XQuery strings are decomposed into many `ContentChar` tokens, and `ContentChar` is reachable through overlapping parser alternatives. c3 explores those alternatives while replaying the token stream up to the caret, causing **exponential** behavior.

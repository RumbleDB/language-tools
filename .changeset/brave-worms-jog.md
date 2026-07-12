---
"jsoniq-language-server": minor
---

Remove useless `isTypeReferenceRule` check because the rules it is checking are not part of the preferred antlr4-C3 rules. Therefore, they will never pass the check.

---
"jsoniq-language-server": minor
---

Add ordinary JSONiq and XQuery keyword completions for window clause, quantified expressions, sorting modifiers, word operators, and type operations. Filter keywords accepted as names out of syntax suggestions and support manually typed phrase continuations.

Remove scripting and update keyword suggestions, and rank structural continuations ahead of optional operators and uncommon constructs.

Distinguish operators, literal values, and variable declaration starters with their corresponding completion kinds.

Offer keywords while typing an identifier prefix, such as `re` for `return` after a FLWOR binding.

Suggest `$` through the normal grammar token completion pipeline alongside valid clause alternatives. Remove the exclusive variable declaration provider and its token context heuristics, while keeping unrelated name and operator suggestions out of clause starts.

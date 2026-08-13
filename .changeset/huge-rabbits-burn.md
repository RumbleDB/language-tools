---
"jsoniq-language-server": minor
---

fix: declaration and variables in prolog does not have order

"A variable initializer sees all functions, variables, and namespaces declared/imported anywhere in the Prolog—except the variable currently being initialized."

"A declared function body sees all Prolog functions, variables, and namespaces, including itself."

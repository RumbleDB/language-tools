---
"rumble-lsp-wrapper": patch
---

Hover and variable completion no longer show types from imported modules. The wrapper took the positions of expressions and variables in an imported library for positions in the open document, so hovering on `declare variable` in a main module could show the type of a function that the library declares on the same line.

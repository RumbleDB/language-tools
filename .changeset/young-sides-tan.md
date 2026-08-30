---
"jsoniq-language-server": minor
---

The rename feature was refactored to expand support from variables and parameters to user-defined functions and custom schema types (declare type). Renaming a function or type now automatically updates both its declaration and all call sites/references across every open and unopened module in the workspace.

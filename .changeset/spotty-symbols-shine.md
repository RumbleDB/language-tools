---
"jsoniq-vscode": patch
---

fix: do not switch document language automatically if it was not JSONiq or XQuery

This prevents problem with Jupyter Notebook cell, which is set to use Python language

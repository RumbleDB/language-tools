---
"jsoniq-language-server": patch
---

Correct the module path for `vscode-languageserver/node` to avoid an import error in the bundled version. It was previously imported as `vscode-languageserver/node.js`.

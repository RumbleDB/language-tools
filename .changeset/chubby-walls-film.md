---
"jsoniq-vscode": minor
"jsoniq-language-server": minor
---

Add XQuery to the VSCode extension language selector. It will be selected statically based on the file extension (see the VSCode extension's `package.json`) and dynamically based on the `ACTIVE_PARSER_NOTIFICATION` sent by the language server. Therefore, it can switch if the string `xquery version` is found in the document.

Additionally, TextMate syntax has been added to enhance the syntax highlighting experience.

---
"jsoniq-language-server": minor
---

Restructure `getActiveParserId` function logic:

1. If the document's language ID is neither JSONiq nor XQuery and the document is not part of a Jupyter Notebook cell, it is not supported by our language server.
2. If the document contains 'jsoniq version' or 'xquery version', use the respective parser.
3. Otherwise, fall back to the document's language ID property.

We no longer check the file extension. This is because the VSCode extension (or other language server invoker) can do that.

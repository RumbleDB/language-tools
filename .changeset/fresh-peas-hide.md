---
"jsoniq-language-server": minor
"rumble-lsp-wrapper": minor
---

fix: variable declaration hovers not showing correct static type

Fixed by adding ExceptionMetadata to variable bindings in RumbleDB. Changed the commit to https://github.com/RumbleDB/rumble/commit/dd824427c8e199eccfd6c26db0e8ec8ce85c1abc.

Cover FLWOR and window variables, function parameters, quantified expressions, typeswitch cases, copy bindings, and scripting declarations in JSONiq and XQuery. Handle multiple bindings and shadowed variables correctly.

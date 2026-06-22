---
"rumble-lsp-wrapper": minor
---

Add a Range record to the LSP wrapper to represent ranges in source code because more precise range information is now available in RumbleDB. Previously, we only had the start position; the end position was assumed to be the start of the next line.

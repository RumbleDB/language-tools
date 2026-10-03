---
"rumble-lsp-wrapper": minor
---

feat(lsp-wrapper): optimize output handling in runDaemon method for JSON serialization

Previously, it built the entire response JSON as a String before writing it. Now, Jackson writes incrementally through a buffered writer, avoiding that extra full copy.

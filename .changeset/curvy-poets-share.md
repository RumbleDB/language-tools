---
"jsoniq-language-server": patch
---

Use pidusage to get memory usage information

Because ps is not available on Windows machine and will cause the server to crash.

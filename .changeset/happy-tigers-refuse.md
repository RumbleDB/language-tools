---
"jsoniq-language-server": minor
---

feat: send syntax and semantic diagonostics inmediately in `DiagnosticsManager`.

Previously, we wait for the `collectStaticTypecheckDiagnostics` to finish before sending the diagnostics, which is an async request to the Java wrapper and might hang the language server for a while. Now, we send the syntax and semantic diagnostics immediately, and then we send the static typecheck diagnostics when they are ready.

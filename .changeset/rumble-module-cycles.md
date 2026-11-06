---
"jsoniq-language-server": minor
"jsoniq-vscode": minor
"rumble-lsp-wrapper": minor
---

feat: upgrade RumbleDB to https://github.com/RumbleDB/rumble/commit/e4206f70261bd1dd430c6d41063c0a33743fec8b and sync its grammar changes

See https://github.com/RumbleDB/rumble/pull/2025 and https://github.com/RumbleDB/rumble/pull/2064

Cyclic module imports no longer overflow the stack. The `module` rule now lives in the shared grammar, so an XQuery file can no longer contain several main modules separated by `;`.

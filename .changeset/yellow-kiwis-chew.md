---
"rumble-lsp-wrapper": minor
"jsoniq-vscode": minor
"jsoniq-language-server": minor
---

Improved local development build performance by caching unchanged Java wrapper builds, reusing existing built-in catalogs, and enabling incremental TypeScript type-checking. Production builds continue to regenerate catalogs and bypass development caches.

Added coordinated watch scripts, separated wrapper tests from development packaging while retaining full CI coverage, and cached the assembled RumbleDB JAR in CI. Also fixed production builds to use the extension’s production configuration.

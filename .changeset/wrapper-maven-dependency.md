---
"rumble-lsp-wrapper": patch
"jsoniq-language-server": patch
---

Build the wrapper jar with RumbleDB as a regular Maven dependency. The jar now contains a single version of each library: it used to mix classes from two versions of some, such as `jackson-core` 2.18.2 and 2.18.6.

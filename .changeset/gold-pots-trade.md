---
"jsoniq-language-server": minor
---

refactor: remove the global `getWrapperClient()` singleton and module-level mutable state in favor of a WrapperClient interface and explicit dependency injection.

The wrapper client instance is now owned by `ServerContext`, threaded through all dependent LSP features, and gracefully disposed on server shutdown to prevent orphan Java processes. Additionally, unit tests were refactored to use in-memory mock wrapper clients rather than runtime spyOn monkey patches.

---
"jsoniq-language-server": minor
"jsoniq-vscode": minor
---

feat: make `run-query` request cancellable by supporting `CancellationToken` from language server protocol.

> A cancellation token (CancellationToken) in the Language Server Protocol (LSP) is an object that lets a client tell a server to stop working on an ongoing request.

This is very useful when user runs a big query and then decides to cancel it. With this implementation, the wrapper client will be closed and restarted on the next request. This is a simple workaround as all requests are processed sequentially in the Java wrapper.

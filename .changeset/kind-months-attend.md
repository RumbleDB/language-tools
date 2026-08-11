---
"jsoniq-language-server": minor
---

Extend module support from open documents to the entire workspace.

The language server discovers JSONiq and XQuery files in workspace folders, indexes unopened library modules, and keeps the index synchronized with file and workspace-folder changes. Find References and Rename can therefore locate usages across files, including references from main modules to declarations exported by library modules.

Workspace handling is separated into document storage, module resolution, dependency tracking, and symbol indexing. Analyses are cached and invalidated transitively when module dependencies change, open editor content takes precedence over disk content, and failures in individual files do not interrupt indexing of the remaining workspace. Module imports also provide document links and support resolving relative file locations

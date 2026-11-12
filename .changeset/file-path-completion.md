---
"jsoniq-language-server": minor
"jsoniq-vscode": minor
---

Completion suggests the files and directories of a path in a string: the file that a function reads, such as `json-lines("data/¦")`, `parquet-file`, `delta-file`, `json-doc` or `unparsed-text`, and the location of a module or schema import. Relative paths start where RumbleDB resolves them: a module next to the module that imports it, and a schema or a file at the query's `declare base-uri`, or else next to the query. Module imports list only directories and modules. Hidden entries show once their name is being typed, and links to directories count as directories. An entry replaces the whole name that the cursor is in, and choosing a directory suggests its entries in turn. The extension now suggests as the user types inside strings, so the paths show without asking for completion.

---
"jsoniq-language-server": patch
---

Resolve the relative paths of a notebook cell against its notebook, as when the cell runs. RumbleDB was given the cell's `vscode-notebook-cell:` URI as the base URI, so reading a file such as `delta-file("table")` failed with "No file system is configured for scheme vscode-notebook-cell". Module imports, schema locations and file path completion in cells also resolve next to the notebook now.

# JSONiq and XQuery Language Support

Welcome to the official VS Code extension for **JSONiq** and **XQuery**, powered by [RumbleDB](https://rumbledb.org/).

This extension provides rich language intelligence to make writing JSONiq and XQuery code faster, easier, and more reliable.

## Features

- ✨ **Syntax Highlighting**: Full language grammar highlighting for `.jq`, `.jsoniq`, `.xq`, `.xqy`, and `.xquery` files.
- 🔍 **Diagnostics**: Real-time syntax validation and semantic error reporting directly in your editor.
- 💡 **Code Completion**: Smart suggestions for built-in functions, variables, and keywords.
- 📓 **Jupyter Notebook Integration**: Seamless language support inside Jupyter Notebook cells.

## Requirements

To fully utilize the advanced features powered by RumbleDB (such as deep semantic diagnostics and advanced completions), **Java 17 or higher** must be installed on your system.

If Java is not found, the extension will fall back to providing basic syntax highlighting and basic token-based features.

## Extension Settings

You can customize the extension through your VS Code settings:

- `jsoniq.lsp.wrapper.enabled`: Enable enhanced Language Server Protocol features powered by the RumbleDB Java wrapper. (Default: `true`)

## Support & Feedback

If you encounter any issues, have feature requests, or want to contribute to the project, please visit the [RumbleDB Language Tools GitHub repository](https://github.com/RumbleDB/language-tools).

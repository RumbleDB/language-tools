# JSONiq and XQuery Language Tools

Editor support for [JSONiq](https://www.jsoniq.org/) and XQuery, built around the [RumbleDB](https://rumbledb.org/) engine. It includes a language server, a VS Code extension, and a small Java process that lets the server ask RumbleDB about your query.

![A JSONiq query in VS Code with its results shown as a table and as an expandable list](https://github.com/user-attachments/assets/dd9657ae-3b08-494f-8dd6-110ac1778e3b)

If you just want to write queries, install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RumbleDB.jsoniq-vscode) or [Open VSX](https://open-vsx.org/extension/RumbleDB/jsoniq-vscode). Its [README](./packages/vscode-extension/README.md) covers what it does. For other editors, see the [language server](./packages/language-server/README.md).

## Packages

| Package                                                | What it is                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [`jsoniq-language-server`](./packages/language-server) | The LSP server, written in TypeScript. Parsing, completion, navigation and formatting happen here.       |
| [`rumble-lsp-wrapper`](./packages/rumble-lsp-wrapper)  | A long-running Java process around RumbleDB. It handles type checking, type lookups and running queries. |
| [`jsoniq-vscode`](./packages/vscode-extension)         | The VS Code extension: TextMate grammars, the language client, and the query results panel.              |

They fit together like this:

```mermaid
flowchart LR
    vscode["VS Code extension"] -- LSP --> server["Language server"]
    server -. "JSON over stdin/stdout" .-> wrapper["Java wrapper (RumbleDB)"]
```

The server works without the wrapper, so you can turn it off or run without Java. You lose type checking, type-aware completion and running queries, but everything based on the parser keeps working.

## Building from source

You need [Node.js](https://nodejs.org/) (CI runs on 26), [pnpm](https://pnpm.io/), Java 17+, Maven and Git. The first build fetches RumbleDB at a pinned commit and compiles it, so expect it to take a while.

```bash
pnpm install
pnpm run generate:grammar
pnpm run build
```

To try your build, open the repo in VS Code and start the **Launch VSCode Exension** debug configuration. `pnpm run dev` rebuilds the server, webview and extension as you edit.

## Common commands

| Command               | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `pnpm run build`      | Builds the wrapper, server and extension.                        |
| `pnpm run build:prod` | Clean production build, including regenerated built-in catalogs. |
| `pnpm run dev`        | Builds once, then watches the server, webview and extension.     |
| `pnpm test`           | Runs the wrapper tests, then the language server tests.          |
| `pnpm run lint`       | Lints with oxlint.                                               |
| `pnpm run fmt`        | Formats with oxfmt (and Spotless for the Java code).             |
| `pnpm run clean`      | Removes `dist` folders and the Java `target` directory.          |

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/RumbleDB/language-tools/issues). If your change affects a published package, add a changeset with `pnpm changeset`.

## License

[Apache License 2.0](LICENSE)

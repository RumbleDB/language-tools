# JSONiq Language Server

A Language Server Protocol implementation for JSONiq and XQuery. It powers the [VS Code extension](https://github.com/RumbleDB/language-tools/tree/main/packages/vscode-extension), and works with any other editor that has an LSP client.

## Usage

```bash
npm install jsoniq-language-server
node node_modules/jsoniq-language-server/dist/main.mjs --stdio
```

Point your editor's LSP client at that command. The server chooses a parser from the document's language ID (`jsoniq` or `xquery`), so make sure your client sends one of those.

## Supported LSP features

- Diagnostics, completion, hover and signature help
- Go to definition, find references and rename
- Document symbols and document links
- Formatting, inlay hints, code lens and semantic tokens

Files are parsed with ANTLR grammars for both languages, which keeps these features working on incomplete code. Some features also use RumbleDB, as described below.

## RumbleDB and Java

Type-checking diagnostics, inferred types and running queries come from RumbleDB, through the [Java wrapper](https://github.com/RumbleDB/language-tools/tree/main/packages/rumble-lsp-wrapper). This needs Java 17 or newer on your `PATH`.

The wrapper JAR is too large to ship in the npm package. The server downloads it from GitHub Releases when it is first needed, checks its SHA-256 against the bundled manifest, and caches it. Set `JSONIQ_LSP_CACHE_DIR` to control where it is stored.

If you don't want any of this, set `wrapper.enabled` to `false` (see below) and the server runs on the parser alone.

## Configuration

Pass options as `initializationOptions`. These are the defaults:

```json
{
    "wrapper": { "enabled": true },
    "formatter": {
        "indentSize": 4,
        "maxLineWidth": 100,
        "useTabs": false,
        "blankLineBetweenDeclarations": true,
        "insertFinalNewline": true
    }
}
```

## Custom protocol messages

These go beyond standard LSP. A client can ignore them, but needs `jsoniq/runQuery` and a `jsoniq.runQuery` command to make the **Run Query** code lens do anything.

| Method                             | Kind         | Purpose                                        |
| ---------------------------------- | ------------ | ---------------------------------------------- |
| `jsoniq/runQuery`                  | request      | Runs a query and returns its results or error. |
| `jsoniq/active-parser`             | notification | Tells the client which parser a document uses. |
| `jsoniq/memory-usage`              | notification | Reports server and wrapper memory use.         |
| `jsoniq/wrapper-download-progress` | notification | Reports progress of the wrapper JAR download.  |

TypeScript definitions are exported from `jsoniq-language-server/requests` and `jsoniq-language-server/notifications`.

## Development

Run these from this package, after following the [build instructions](https://github.com/RumbleDB/language-tools#building-from-source) in the repository root:

| Command                          | What it does                                                |
| -------------------------------- | ----------------------------------------------------------- |
| `pnpm run generate:grammar`      | Regenerates the lexers and parsers from the `.g4` files.    |
| `pnpm run build`                 | Compiles function docs and built-in catalogs, then bundles. |
| `pnpm run watch`                 | Type-checks and rebundles on change.                        |
| `pnpm test`                      | Runs the Vitest suite.                                      |
| `pnpm run missing-function-docs` | Lists built-in functions that have no documentation yet.    |

Documentation for RumbleDB's own built-in functions lives in [`docs/functions`](https://github.com/RumbleDB/language-tools/tree/main/packages/language-server/docs/functions), as one Markdown file per function.

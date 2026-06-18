# RumbleDB Language Tools

This repository contains the language support tools for JSONiq and XQuery, primarily powered by [RumbleDB](https://rumbledb.org/).

## Features

- **Syntax highlighting** for JSONiq (`.jq`) and XQuery (`.xq`)
- **Code completion** and **hover documentation**
- **Diagnostics** and syntax error reporting
- Enhanced language support via the RumbleDB Java wrapper

## Workspace Structure

This is a monorepo managed with `pnpm`, containing the following packages:

- **[`jsoniq-language-server`](./packages/language-server)**: The Language Server Protocol (LSP) implementation for JSONiq and XQuery.
- **[`rumble-lsp-wrapper`](./packages/rumble-lsp-wrapper)**: A Java-based wrapper providing advanced LSP capabilities by directly leveraging the RumbleDB engine.
- **[`jsoniq-vscode`](./packages/vscode-extension)**: The Visual Studio Code extension providing IDE integration.

## Building from source

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Java 17+](https://adoptium.net/) (for the RumbleDB wrapper)
- [Maven](https://maven.apache.org/) (for building the RumbleDB wrapper)

### Setup & Build

1. Install dependencies:

    ```bash
    pnpm install
    ```

2. Generate the language grammar files:

    ```bash
    pnpm run generate:grammar
    ```

3. Build all packages:

    ```bash
    pnpm run build
    ```

### Scripts

- `pnpm run build`: Builds the wrapper, language server, and client.
- `pnpm run clean`: Cleans the `dist` folders and Java `target` directories.
- `pnpm run lint`: Lints the codebase using `oxlint`.
- `pnpm run fmt`: Formats the codebase using `oxfmt`.
- `pnpm run test`: Runs the test suite for the language server.

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

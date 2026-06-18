# JSONiq Language Server

The Language Server Protocol (LSP) implementation for JSONiq and XQuery.

## Overview

This package implements the core logic for language intelligence, capable of being consumed by any IDE that supports the Language Server Protocol.

It offers basic parsing and tokenization using ANTLR4, and integrates with the RumbleDB Java wrapper to provide advanced capabilities such as deep semantic diagnostics and enhanced code completion.

## Development

### Prerequisites

- Node.js (v18+)
- pnpm

### Scripts

Before building the language server for the first time, you must generate the grammar lexer and parser files:

- `pnpm run generate:grammar`: Generates the ANTLR lexers and parsers from the `.g4` grammar files.

Other available scripts:

- `pnpm run build`: Compiles the server and its dependencies.
- `pnpm run watch`: Runs the TypeScript compiler in watch mode.
- `pnpm run test`: Runs the Vitest suite.

## Running

The language server is typically launched by a client (such as the VS Code extension). Its entry point is `dist/main.mjs`.

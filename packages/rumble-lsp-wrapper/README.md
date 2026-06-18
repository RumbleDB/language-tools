# RumbleDB LSP Wrapper

A Java wrapper around RumbleDB to expose advanced features to the Language Server Protocol (LSP).

## Overview

While the TypeScript language server provides basic syntax and tokenization, deep semantic understanding of JSONiq and XQuery is delegated to the actual RumbleDB engine. This package wraps RumbleDB and provides an interface that the Node.js language server can communicate with to obtain:

- Accurate semantic diagnostics
- Context-aware completions
- Type information

## Building

### Prerequisites

- Java 17 or higher
- Apache Maven

### Commands

To build the wrapper and package it into a fat JAR:

```bash
mvn clean package
```

Or run via the pnpm wrapper in the monorepo:

```bash
pnpm run build
```

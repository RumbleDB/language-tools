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

The development build reuses the packaged wrapper when its Java sources, Maven configuration,
version, and RumbleDB JAR are unchanged. Use `pnpm run build:force` to bypass that cache.
Wrapper tests are run separately with `pnpm run test`; production builds remain uncached.

## Schema catalog endpoint

`schema-catalog` loads XML schemas independently of the query body. The request keeps
its existing `documentUri` field, but `body` now contains **base64-encoded UTF-8 JSON**:

```json
{
    "imports": [{ "namespaceUri": "urn:example", "locations": ["types.xsd"] }],
    "baseUri": "schemas/"
}
```

- `imports` is required and contains only the current module's schema imports.
- `locations` is required; an empty array delegates location resolution to RumbleDB
  (which uses the namespace URI, except for the built-in XML Schema namespace).
- `baseUri` is optional: pass the decoded value of `declare base-uri` when present.
  It is resolved against the absolute `documentUri`; otherwise `documentUri` is the base.
- Schema includes and imports are resolved by RumbleDB's existing schema loader.
  Neither the query text nor the query file is read by this endpoint.

The response remains `{ "types": [...], "constructors": [...], "errors": [...] }`.
Names are namespace-qualified without query-specific prefixes. Built-in types and
constructors are excluded. Schema-loading errors retain the existing error format;
without source ranges in the input, their query location is the start of the document.
Invalid request payloads are rejected as request errors.

The language server builds this input from the module prolog, including when the
query body is incomplete. Query text is no longer sent to this endpoint.

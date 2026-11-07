# RumbleDB LSP Wrapper

A Java process that gives the language server access to RumbleDB's compiler and runtime. The server handles parsing itself and comes here for anything that needs the real engine: type checking, the type at a cursor position, and running queries.

You won't normally start this yourself. The language server launches it and keeps it running.

## Building

You need Java 17+, Maven and Git. From the repository root:

```bash
pnpm run build:wrapper
```

This fetches RumbleDB at the commit pinned in `scripts/fetch-rumble.sh`, builds it, and then builds the wrapper. Both steps are cached: the wrapper is only rebuilt when its Java sources, Maven configuration, version or RumbleDB JAR change. To skip the cache, run `pnpm run build:force` in this package. Production builds are never cached.

Run the tests with `pnpm test` in this package, and format the Java code with `pnpm run fmt`.

When a local build exists, the language server uses it. Otherwise it falls back to the JAR from GitHub Releases.

## Running

`org.jsoniq.lsp.wrapper.Main` has two modes.

With `--daemon`, it reads one JSON request per line from stdin and writes one JSON response per line to stdout.

With one of these flags, it prints a JSON catalog and exits. The language server uses them at build time.

- `--dump-builtin-functions`
- `--dump-builtin-types`
- `--dump-builtin-constructors`

## Daemon requests

| Request type        | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `handshake`         | Confirms the process is up, before any other request. |
| `static-typecheck`  | Compiles a query and reports its errors and types.    |
| `type-at-position`  | Finds the static type at a position.                  |
| `focus-at-position` | Finds the type of the context item at a position.     |
| `schema-catalog`    | Loads the types and constructors from XML schemas.    |
| `run-query`         | Runs a query and returns its results.                 |

### `schema-catalog`

This request loads XML schemas without looking at the query, so it still works when the query body is incomplete. The language server builds its input from the module prolog. The request keeps the usual `documentUri` field, but `body` is base64-encoded UTF-8 JSON:

```json
{
    "imports": [{ "namespaceUri": "urn:example", "locations": ["types.xsd"] }],
    "baseUri": "schemas/"
}
```

- `imports` is required, and lists only the current module's schema imports.
- `locations` is required. If it is empty, RumbleDB resolves the location itself, using the namespace URI (except for the built-in XML Schema namespace).
- `baseUri` is optional. Pass the decoded value of `declare base-uri` if there is one. It is resolved against the absolute `documentUri`, which is otherwise the base.

RumbleDB's schema loader follows any includes and imports.

The response is `{ "types": [...], "constructors": [...], "errors": [...] }`. Names are namespace-qualified, without query-specific prefixes, and built-ins are left out. Schema loading errors use the normal error format; since the input has no source ranges, their location is the start of the document. Invalid payloads are rejected as request errors.

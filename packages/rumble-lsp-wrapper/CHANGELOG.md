# rumble-lsp-wrapper

## 0.11.1

### Patch Changes

- [`239d275`](https://github.com/RumbleDB/language-tools/commit/239d27523c4a18cb2a21d8cf8d2d9ada81e4beed) - feat: upgrade RumbleDB to https://github.com/RumbleDB/rumble/commit/7f14c5f2efada2df58838edaf1c9891429d29a61 for a better JSON error message

## 0.11.0

### Minor Changes

- [`cbd9e3b`](https://github.com/RumbleDB/language-tools/commit/cbd9e3b60fefde87e1e21d763d76fec815b39273) - fix: variable declaration hovers not showing correct static type
  
  Fixed by adding ExceptionMetadata to variable bindings in RumbleDB. Changed the commit to https://github.com/RumbleDB/rumble/commit/dd824427c8e199eccfd6c26db0e8ec8ce85c1abc.
  
  Cover FLWOR and window variables, function parameters, quantified expressions, typeswitch cases, copy bindings, and scripting declarations in JSONiq and XQuery. Handle multiple bindings and shadowed variables correctly.

- [`c6d9018`](https://github.com/RumbleDB/language-tools/commit/c6d9018aa00240b51d1d999023a7ad06da8ed1cc) - feat: add union type support and enhance array type handling in type system
  
  Display nullable and array alternatives in inferred object field types without losing known fields.
  
  Upgraded RumbleDB to commit https://github.com/RumbleDB/rumble/pull/1877/changes/f39afa1dfb2e79d0bb3a7dce2d331f3e71815aa0

- [`a3d7c4c`](https://github.com/RumbleDB/language-tools/commit/a3d7c4c01a7c4aa79be6e8fd5e5dc8bf4543774a) - refacrtor: shared type descriptor for static inference and runtime query results, exposing type kind and structure alongside the existing display name and expanded QName metadata
  
  Represent type kinds with discriminated variants. Named descriptors require a QName, while anonymous types retain their structure or use an opaque descriptor with the engine display text.

### Patch Changes

- [`6bf9d88`](https://github.com/RumbleDB/language-tools/commit/6bf9d88b29f5d01088387c2332cba26ff82a7bca) - chore: upgrade RumbleDB to commit https://github.com/RumbleDB/rumble/commit/1edd792a18efe6d86be77a0474884be58203f4da

- [`bf0ec93`](https://github.com/RumbleDB/language-tools/commit/bf0ec93e6e0e8b83ca63e1290b306a91bd33fe7d) - chore: upgrade RumbleDB to commit https://github.com/RumbleDB/rumble/commit/2f8467d74a906405cecbc43a9f55c13ad78b0b60

- [`2a48795`](https://github.com/RumbleDB/language-tools/commit/2a4879591dc06fb7cb186bc15912933ea78a1bd7) - chore: upgrade RumbleDB to commit https://github.com/RumbleDB/rumble/commit/b3b5a795a191c6866ec00e1e714da5ff9dd3a812

## 0.10.0

### Minor Changes

- [`53a70ce`](https://github.com/RumbleDB/language-tools/commit/53a70ce9e811839ca911837702c213a0c4e0f3f6) - feat: return always serialized value from the RunQuery request, and use it in webview UI

- [#83](https://github.com/RumbleDB/language-tools/pull/83) [`b1d180c`](https://github.com/RumbleDB/language-tools/commit/b1d180cbea2864e6b5947be7d4a2824d525ea164) - refactor: make query result data model more structured by using discriminated unions and required properties for each item kind, and adapt the VS Code list and table views to the new API.
  
  The exported `RunQueryItem` type is now a discriminated union with required properties for each item kind. Clients consuming `jsoniq/runQuery` results must update for these breaking payload changes:
  
  - Type metadata is grouped under `type.displayName` and optional `type.qname`, replacing the string `type` and top-level `typeName`.
  - Objects expose `fields` containing literal `name` and sequence-valued `value` properties. Maps retain `entries` with typed atomic keys, including null keys, and sequence-valued values.
  - Arrays require `members`, preserving empty and multi-item member sequences. Nodes require `nodeKind`.
  - Functions expose `name`, `arity`, and `signature` directly instead of nesting them under `function`.
  - `lexicalValue` is removed. Use `serialized` for value text, previews, copying, and exports, and object field names directly when projecting table columns.
  
  The backend separates item conversion from the result model and preserves runtime maps even when their contents resemble objects. Fallback query responses now contain a structured error instead of returning both `items` and `error` as null. The response envelope remains `{ items, error }`.
  
  The webview renders the new item variants, uses qualified type names for value colors, preserves literal object field names in table projection, and displays expanded function signatures once.

- [`913a1b9`](https://github.com/RumbleDB/language-tools/commit/913a1b9584ad12ffb0ae28a2dcadde172c748f96) - feat(lsp-wrapper): optimize output handling in runDaemon method for JSON serialization
  
  Previously, it built the entire response JSON as a String before writing it. Now, Jackson writes incrementally through a buffered writer, avoiding that extra full copy.

- [`08db3f8`](https://github.com/RumbleDB/language-tools/commit/08db3f8205d174534026b3cc5f03ac525f7893fe) - refactor(RunQuery): replace Rumble instance with lazy initialization using `createSequence` method
  
  Avoid starting Spark for local queries by using RumbleDB’s compilation and execution pipeline directly. Distributed queries still initialize Spark when needed. This reduce Java process memory usage when running queries.
  
  In a local benchmark using `1 + 1`, process memory after the first result decreased from approximately 401 MiB to 217 MiB, and first-query time decreased from 2.5 seconds to 0.6 seconds. Improvements vary by query and environment; complete query results are still collected in memory.

### Patch Changes

- [`7a98e6f`](https://github.com/RumbleDB/language-tools/commit/7a98e6fd69177ab645fc0eaae7ace0edfae6f842) - fix: catch serialize error correctly in RunQuery request

## 0.9.0

### Minor Changes

- [#72](https://github.com/RumbleDB/language-tools/pull/72) [`98ef780`](https://github.com/RumbleDB/language-tools/commit/98ef78007234cd7fb428f8e5d39ddefff6d16dd6) - Add completion, hover, and signature help for built-in XML Schema constructors, like `xs:integer("2")`

- [#70](https://github.com/RumbleDB/language-tools/pull/70) [`b7e13ad`](https://github.com/RumbleDB/language-tools/commit/b7e13adc45d69f6ce334c3710c321b9e2cb3cd9f) - feat: upgrade RumbleDB to latest master commit cea0355
  
  See https://github.com/RumbleDB/rumble/compare/02f5c8bbc9591da9935d6a0687cbb20b61b70827...cea035505f3133aa9f442bc23049460ea8424c5d for differences

- [#81](https://github.com/RumbleDB/language-tools/pull/81) [`36d1ab1`](https://github.com/RumbleDB/language-tools/commit/36d1ab13da1bdbf7fae54ff3f748679fe59e9941) - Refactor query execution and results presentation across the stack:
  
  - **Rumble LSP Wrapper**: Return structured `QueryResultItem` objects preserving item type metadata (atomic, object, array, XML) in query responses.
  - **Language Server**: Support typed query result items in the `jsoniq/runQuery` LSP protocol.
  - **VS Code Extension & Results UI**:
      - Improve Results UI with structured sequence and item presentation, including expandable nested objects and XML rendering.
      - Simplify UI layout by consolidating execution metadata, copy, and export actions into the header bar.
      - Clean up footer to focus strictly on pagination controls.
      - Establish a type-safe message protocol between the results webview and the extension host.

- [`3d3bb13`](https://github.com/RumbleDB/language-tools/commit/3d3bb135d9a257da220faf55b84a6d11f6480867) - refactor: enforce document URI requirement across run-query and type-checking operations

- [#75](https://github.com/RumbleDB/language-tools/pull/75) [`a7a2205`](https://github.com/RumbleDB/language-tools/commit/a7a22054a8150c65725f01b258481a778289a1ed) - Add a schema catalog endpoint and client to load imported XML Schema types, constructor signatures, source files, and dependencies.

- [#80](https://github.com/RumbleDB/language-tools/pull/80) [`1fc174a`](https://github.com/RumbleDB/language-tools/commit/1fc174ac61e5d139fcd35a820b2074570d67c8e4) - feat: return structured error information from RumbleDB and display it in the results webview

- [`9fff54e`](https://github.com/RumbleDB/language-tools/commit/9fff54ee3c052230a2dc203079782fc08016be22) - refactor: replace VisitorHelpers with CompilationPipeline for module parsing

- [#74](https://github.com/RumbleDB/language-tools/pull/74) [`1db8ed2`](https://github.com/RumbleDB/language-tools/commit/1db8ed2160d212fe5e9d0c08b83204e570439873) - feat(run-query): resolve query resources relative to the document URI, so queries that depend on relative paths can be resolved correctly.

- [`27bddd6`](https://github.com/RumbleDB/language-tools/commit/27bddd69f2f061f3488814e14c740afea4b650cc) - chore: upgrade RumbleDB to master/34de0e03e4211e585061bf8e8d0128b62b825a23
  
  See https://github.com/RumbleDB/rumble/commit/34de0e03e4211e585061bf8e8d0128b62b825a23

## 0.8.0

### Minor Changes

- [#67](https://github.com/RumbleDB/language-tools/pull/67) [`995a5aa`](https://github.com/RumbleDB/language-tools/commit/995a5aa1ee22a35d0a4322e3a2a70922b2cef5f8) - chore(deps): upgrade RumbleDB to commit [02f5c8b](https://github.com/RumbleDB/rumble/commit/02f5c8bbc9591da9935d6a0687cbb20b61b70827)
  
  Now it supports XML schema, and adds a new `jn:tanh` function in the JSONiq standard library.

## 0.7.1

### Patch Changes

- [`f79f941`](https://github.com/RumbleDB/language-tools/commit/f79f9410ad593365f50de1b63c8b1d5541621c3c) - refactor: use Rumble public API to run the query, and upgrade RumbleDB to commit 7abb4441baf9235e12e88f0073df24296e0f2007, where we no longer use RuntimeIterator, and switched to ItemRuntimePlan.

- [`23743c4`](https://github.com/RumbleDB/language-tools/commit/23743c45b1cb22443812763edc2549b4d2a42851) - refactor: lazy initialize Rumble instance in RunQuery handler

## 0.7.0

### Minor Changes

- [#52](https://github.com/RumbleDB/language-tools/pull/52) [`25ed540`](https://github.com/RumbleDB/language-tools/commit/25ed540166cfabb68a49dbb28beceb4f5479dc74) - Add library-module parsing, import resolution, document links, and cross-file definitions, references, renames, and diagnostics for JSONiq and XQuery.

  Recognize module file extensions in VS Code and keep module analysis synchronized with open documents and workspace file changes.

- [`f31310b`](https://github.com/RumbleDB/language-tools/commit/f31310bc5da52fbdb938664f5e2e8fb66edf297e) - Improved local development build performance by caching unchanged Java wrapper builds, reusing existing built-in catalogs, and enabling incremental TypeScript type-checking. Production builds continue to regenerate catalogs and bypass development caches.

  Added coordinated watch scripts, separated wrapper tests from development packaging while retaining full CI coverage, and cached the assembled RumbleDB JAR in CI. Also fixed production builds to use the extension’s production configuration.

## 0.6.1

### Patch Changes

- [`e0dafdb`](https://github.com/RumbleDB/language-tools/commit/e0dafdbe4aa2fef4e50e0f48bb74bd83b387a2d6) - Upgrade RumbleDB to https://github.com/RumbleDB/rumble/commit/b8542ba408571cd399611154d3380f460892d9a5

## 0.6.0

### Minor Changes

- [#45](https://github.com/RumbleDB/language-tools/pull/45) [`4772a5e`](https://github.com/RumbleDB/language-tools/commit/4772a5e0750a571d3c87d142aa6580a0fbff8362) - Introduce full query execution support for JSONiq and XQuery files powered by RumbleDB, allowing users to run queries directly within VS Code and view formatted results in a side-by-side webview panel.

  The Java LSP wrapper now includes a dedicated `RunQuery` handler that executes JSONiq/XQuery scripts against the RumbleDB query engine and serializes execution results as structured JSON arrays.

  The Language Server protocol layer adds custom `runQuery` request handlers, protocol interfaces, and client execution helpers to bridge query execution requests between the editor client and the underlying Java wrapper process.

  The VS Code extension registers the `jsoniq.runQuery` command in editor context menus and title bars. It creates a new webview panel to display query results in a structured table format, powered by the new `@jsoniq/results-ui` webview package built with SolidJS and TanStack Table.

- [`1882dcc`](https://github.com/RumbleDB/language-tools/commit/1882dccc6cb33fa465132eb5992602b61b352a0e) - Switch RumbleDB to the next branch and update the commit to the latest commit on that branch (https://github.com/RumbleDB/rumble/commit/d08d74d67fb569478280e3586fbc02685b4e1206).

- [#44](https://github.com/RumbleDB/language-tools/pull/44) [`0a67f42`](https://github.com/RumbleDB/language-tools/commit/0a67f42b9176ea7f3dd87e10c963789bf74e1bc2) - Replace the legacy static type index, which is carried with the `static-typecheck` request, with on-demand type queries via `type-at-position`. In the language server (packages/language-server), the full-document type table caching and indexing files (index.ts, key.ts, and format.ts) were removed and the hover.ts file was simplified to dynamically fetch types per position.

  In the Java wrapper (packages/rumble-lsp-wrapper), `StaticTypeChecker.java` was modified to **focus strictly on error diagnostics** rather than building whole-document type maps. Meanwhile, `TypeAtPosition.java` was modified to resolve types and AST ranges dynamically. It has also been refactored to use a `AbstractNodeVisitor` for cleaner traversal of the AST and allow for future extensibility.

- [#41](https://github.com/RumbleDB/language-tools/pull/41) [`dcd685f`](https://github.com/RumbleDB/language-tools/commit/dcd685f44ef859208e4cb4cdd29e24b57f632391) - RumbleDB has been updated to latest commit in `next` branch: [7b462ac](https://github.com/RumbleDB/rumble/commit/7b462acaec162990315c5a6ca9ec99d14e90dfdf)

  Also, the following Node.js dependencies have been updated:

  | Dependency              |      From |         To | Scope                                   |
  | ----------------------- | --------: | ---------: | --------------------------------------- |
  | `@changesets/cli`       | `^2.31.0` |  `^2.31.1` | root                                    |
  | `@types/node`           | `^26.0.0` |  `^26.1.2` | language-server, vscode-extension       |
  | `fast-xml-parser`       |  `^5.9.3` |  `^5.10.1` | language-server                         |
  | `lint-staged`           | `^17.0.7` |  `^17.3.0` | root                                    |
  | `npm-run-all2`          |  `^9.0.2` |   `^9.0.3` | root                                    |
  | `oxfmt`                 | `^0.55.0` |  `^0.61.0` | root, language-server, vscode-extension |
  | `oxlint`                | `^1.70.0` |  `^1.76.0` | root, language-server, vscode-extension |
  | `rolldown`              |   `1.1.2` |    `1.2.1` | vscode-extension                        |
  | `tsc-alias`             | `^1.8.17` |   `^1.9.1` | language-server                         |
  | `tsdown`                | `^0.22.3` | `^0.22.14` | language-server                         |
  | `tsx`                   | `^4.22.4` |  `^4.23.1` | language-server                         |
  | `typescript`            |  `^6.0.3` |   `^7.0.2` | language-server, vscode-extension       |
  | `vitest`                |  `^4.1.9` |  `^4.1.10` | language-server                         |
  | `vscode-languageclient` | `^10.0.0` |  `^10.1.0` | vscode-extension                        |
  | `vscode-languageserver` | `^10.0.0` |  `^10.1.0` | language-server                         |

  And Maven dependencies have been updated:

  | Dependency                                    |     From |               To |
  | --------------------------------------------- | -------: | ---------------: |
  | `com.esotericsoftware:kryo`                   |  `5.6.0` |          `5.6.2` |
  | `org.apache.hadoop:hadoop-common`             |  `3.3.6` |          `3.5.0` |
  | `org.apache.spark:spark-sql_2.13`             |  `4.0.1` | `4.2.0-preview5` |
  | `com.fasterxml.jackson.core:jackson-databind` | `2.20.0` |         `2.22.1` |
  | `org.junit.jupiter:junit-jupiter`             | `5.12.2` |          `6.1.2` |

- [`c421fb1`](https://github.com/RumbleDB/language-tools/commit/c421fb17e3cc436c9993d958dddf1e04795daa2d) - Switch the LSP wrapper to use the new RumbleConfiguration API.

## 0.5.0

### Minor Changes

- [`1fb72df`](https://github.com/RumbleDB/language-tools/commit/1fb72df071c6a9c2dc80e7e048398779bbf53a62) - refactor: add BuiltInTypes CLI command to export builtin types as JSON

- [`4b91778`](https://github.com/RumbleDB/language-tools/commit/4b91778e830dbe14991d3e0e714ed17dfca2ad18) - fix: when the cursor is on an object lookup expression, return its type instead of the type of the key

- [#36](https://github.com/RumbleDB/language-tools/pull/36) [`56dcb12`](https://github.com/RumbleDB/language-tools/commit/56dcb12569f6de10276d38abf73c7e30ce659bbb) - feat: enhance TypeDefinition structure to support object and array types

- [`fbf4d50`](https://github.com/RumbleDB/language-tools/commit/fbf4d50f14678abf012eea1a046cf45ed5738516) - refactor: implement CLI command structure with BuiltinFunctions and CLICommand interface

- [`96ca1d9`](https://github.com/RumbleDB/language-tools/commit/96ca1d9b4c91a890c20c9951a80ae2ddd09e889b) - Simplify the LSP wrapper code by avoiding the use of reflection to access the built-in function catalogue, now that a public API is available.

- [#34](https://github.com/RumbleDB/language-tools/pull/34) [`6fd4993`](https://github.com/RumbleDB/language-tools/commit/6fd4993e0efc6aa5900e25849b2ec27bc139099c) - Add type declaration and resolution support to the language server. Types are no longer treated as strings, but rather as structured objects with a QName. The LSP wrapper has been updated to reflect this change. Undo the change to the smaller .jar build in the LSP wrapper because it was causing a `ClassNotFoundException`.

- [#37](https://github.com/RumbleDB/language-tools/pull/37) [`055992e`](https://github.com/RumbleDB/language-tools/commit/055992edc63cb03caee0c7eab36f650296a25abd) - Implement `type-at-position` request in the LSP wrapper, which returns the type of the **expression** at a given position in the document. The response includes the sequence type and the range of the expression.

  It has been integrated into the `hover` request, so that hovering over an expression will show its type.

  This change requires this pull request of RumbleDB to be merged first: https://github.com/RumbleDB/rumble/pull/1536

- [#35](https://github.com/RumbleDB/language-tools/pull/35) [`545f801`](https://github.com/RumbleDB/language-tools/commit/545f8017b87c1f53e3ebb212a5ffb2341d674885) - Add a Range record to the LSP wrapper to represent ranges in source code because more precise range information is now available in RumbleDB. Previously, we only had the start position; the end position was assumed to be the start of the next line.

- [`f71f8ed`](https://github.com/RumbleDB/language-tools/commit/f71f8edebe7b9834db62c7521d713235722f0144) - Update RumbleDB version to commit https://github.com/RumbleDB/rumble/commit/dab07d28011d059c5c041eecbd118f0ccce008fe

### Patch Changes

- [`d5a1dc8`](https://github.com/RumbleDB/language-tools/commit/d5a1dc8545a818a84f587f7b33cb234be16bddbd) - Update RumbleDB to the latest master commit (https://github.com/RumbleDB/rumble/commit/377808de4ed53b0d0f05dca949990aaff060c41a)

## 0.4.1

### Patch Changes

- [`9d73984`](https://github.com/RumbleDB/language-tools/commit/9d73984a7277db2d6153a01fdf22d9fc6b77529d) - Add README to packages

- [`7bb9367`](https://github.com/RumbleDB/language-tools/commit/7bb93679564750f15aa4e84191bcad69391d237f) - Update RumbleDB to the latest commit (https://github.com/RumbleDB/rumble/commit/b71e18723464414f1a2c709eacc09409832d5766) from the master branch.

- [`0bba37f`](https://github.com/RumbleDB/language-tools/commit/0bba37f0154e67055bbeb7bd030ac8f0c5a7f1ff) - Add Apache 2.0 license

## 0.4.0

### Minor Changes

- [#24](https://github.com/RumbleDB/language-tools/pull/24) [`a784752`](https://github.com/RumbleDB/language-tools/commit/a784752010f391277d8e39738b8e0ccf3bca2e6a) - Pre-generate builtin functions JSON file and save it to `assets` folder.

  These functions are always the same for each version of the language server. Pre-generating them saves runtime and makes the wrapper solely responsible for static type checking, which is optional.

- [#22](https://github.com/RumbleDB/language-tools/pull/22) [`1b9b740`](https://github.com/RumbleDB/language-tools/commit/1b9b74082a213f14f235bc3cdc2afaee7446cd97) - Rename `TypeInferencer` to `StaticTypeChecker` and return all static errors (`RumbleException`) in the `error` field of the body object. Previously, these errors were returned in the `error` field of the top-level response object. This made it difficult to distinguish between an exception from Java and a static type error from Rumble.

## 0.3.0

### Minor Changes

- [#12](https://github.com/RumbleDB/language-tools/pull/12) [`f205855`](https://github.com/RumbleDB/language-tools/commit/f205855c963c13a8a237eaa3fbd838ed96400d88) - add QName support to language server

  Previously, the language server resolved names based on the prefix and local name, which could lead to incorrect resolutions in cases where the same local name was used with different prefixes. With the addition of QName support, the language server can now correctly resolve names based on the full qualified name, ensuring accurate name resolution even in cases where multiple prefixes are used. For example:

  ```jsoniq
  declare namespace aliasfn = "http://www.w3.org/2005/xpath-functions";
  let $a := aliasfn:local-name-from-QName(aliasfn:QName('https://example.com', 'test'))
  return $a
  ```

## 0.2.0

### Minor Changes

- [`18c9df9`](https://github.com/RumbleDB/language-tools/commit/18c9df97bbebc43a6e455705c6596d26eb6c35dd) - Upgrade to latest master commit of RumbleDB ([21022a95493edad91b15861c52cd55884c3d42db](https://github.com/RumbleDB/rumble/commit/21022a95493edad91b15861c52cd55884c3d42db))

### Patch Changes

- [#8](https://github.com/RumbleDB/language-tools/pull/8) [`a7d9025`](https://github.com/RumbleDB/language-tools/commit/a7d90253d751166e0a1639cfd634e19ac4628591) - rename package from `org.jsoniq.lsp.rumble` to `org.jsoniq.lsp.wrapper`

## 0.1.2

### Patch Changes

- [`d9d30f3`](https://github.com/RumbleDB/language-tools/commit/d9d30f31f82165439b45d54636be48ae807cb0c2) - fix the commit hash of RumbleDB in `fetch-rumble.sh` script to make build reproducible

## 0.1.1

### Patch Changes

- [#2](https://github.com/RumbleDB/language-tools/pull/2) [`2c0b7e0`](https://github.com/RumbleDB/language-tools/commit/2c0b7e0f252ec9c524986f949aedfb1ada2af378) Thanks [@CaiJimmy](https://github.com/CaiJimmy)! - Add `package.json` to rumble-lsp-wrapper, so it can have it's own version number and release cycle.

  One advantage of this is that the release of Rumble LSP Wrapper can be decoupled from the release of language servers. This means we can release language servers without rebuilding Rumble LSP Wrapper if it hasn't changed. This avoids re-downloading the .jar file for rumble-lsp-wrapper when no changes have been made, which can save users who have already downloaded it a lot of time and bandwidth.

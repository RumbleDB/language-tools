# jsoniq-language-server

## 2.11.0

### Minor Changes

- [#63](https://github.com/RumbleDB/language-tools/pull/63) [`f1e1b9c`](https://github.com/RumbleDB/language-tools/commit/f1e1b9c801a8743740858d6a79351d780c92180e) - feat: make `run-query` request cancellable by supporting `CancellationToken` from language server protocol.
  
  > A cancellation token (CancellationToken) in the Language Server Protocol (LSP) is an object that lets a client tell a server to stop working on an ongoing request.
  
  This is very useful when user runs a big query and then decides to cancel it. With this implementation, the wrapper client will be closed and restarted on the next request. This is a simple workaround as all requests are processed sequentially in the Java wrapper.

- [`a791fbc`](https://github.com/RumbleDB/language-tools/commit/a791fbc348d36d22493db25305babc85c7a038c6) - fix: built-in types were not resolved correctly.
  
  Added semantic resolution for built-in JSONiq types in the language server. Built-in functions and types now share a single kind-aware resolver, and built-in type definitions participate in the analysis model alongside source definitions.
  
  Unprefixed type names are resolved through ordered default, JSONiq, and XML Schema namespaces, consistent with built-in function resolution. This prevents valid types such as xs:string, string, item, and array from being reported as undefined.

- [`cd3b59b`](https://github.com/RumbleDB/language-tools/commit/cd3b59b24d3c00c3416556dd4bc3dae23d6702a0) - feat: add restart method to RumbleWrapperClient for process management

- [`3ce2d00`](https://github.com/RumbleDB/language-tools/commit/3ce2d00f2e53b2f83e7c6058fc358349e4e12ec4) - feat: refresh diagnostics when imported module changes

- [#64](https://github.com/RumbleDB/language-tools/pull/64) [`9eb03c1`](https://github.com/RumbleDB/language-tools/commit/9eb03c108cd7a79c2a362b08fec05962440508de) - The rename feature was refactored to expand support from variables and parameters to user-defined functions and custom schema types (declare type). Renaming a function or type now automatically updates both its declaration and all call sites/references across every open and unopened module in the workspace.

### Patch Changes

- [`2d2bd28`](https://github.com/RumbleDB/language-tools/commit/2d2bd2848c2a541f9c7ce53d4fed2067d9ae1087) - fix(formatter): parameter list was not formatted correctly
  
  Unnecessary line breaks were introduced between parameters.

- [`68ac0f9`](https://github.com/RumbleDB/language-tools/commit/68ac0f9bc59f0c5fb28c51dfcb7de028df3c7318) - fix: semantic-token modifiers was assigning `definition` modifier when it was a reference

## 2.10.0

### Minor Changes

- [#58](https://github.com/RumbleDB/language-tools/pull/58) [`00cc55f`](https://github.com/RumbleDB/language-tools/commit/00cc55f0714ee89109ed1795e79d0b0c5d7fa228) - refactor: change the inline completion to use a provider-based pipeline to decouple the logic between different types of completion items.

- [`fdb6004`](https://github.com/RumbleDB/language-tools/commit/fdb6004071e096647f34da3e78236f35a9c23743) - refactor: delay workspace analysis until explicit analysis request or workspace wide definition or reference fetch

- [#61](https://github.com/RumbleDB/language-tools/pull/61) [`9b805f9`](https://github.com/RumbleDB/language-tools/commit/9b805f974fafe0b3cf560991dec5c7ad949f94c5) - refactor: remove the global `getWrapperClient()` singleton and module-level mutable state in favor of a WrapperClient interface and explicit dependency injection.
  
  The wrapper client instance is now owned by `ServerContext`, threaded through all dependent LSP features, and gracefully disposed on server shutdown to prevent orphan Java processes. Additionally, unit tests were refactored to use in-memory mock wrapper clients rather than runtime spyOn monkey patches.

- [`56fe32d`](https://github.com/RumbleDB/language-tools/commit/56fe32dd27f728d4312246ca7f514c1c734a2925) - feat: send syntax and semantic diagonostics inmediately in `DiagnosticsManager`.
  
  Previously, we wait for the `collectStaticTypecheckDiagnostics` to finish before sending the diagnostics, which is an async request to the Java wrapper and might hang the language server for a while. Now, we send the syntax and semantic diagnostics immediately, and then we send the static typecheck diagnostics when they are ready.

- [#59](https://github.com/RumbleDB/language-tools/pull/59) [`bf09ff0`](https://github.com/RumbleDB/language-tools/commit/bf09ff0977b8ff52dcbcf17046ad1cb78a5a7d48) - feat: add hover support to error code by including error-code-target in parser and analysis AST

- [#57](https://github.com/RumbleDB/language-tools/pull/57) [`a9c1047`](https://github.com/RumbleDB/language-tools/commit/a9c104751eee2948461cf88a8243dd705a982340) - feat: load W3C XQuery and XPath error code into the language server and provide information about them in completion.
  
  Old `catchVar` has been removed from the parser grammar, because it was not part of the W3C XQuery and XPath specification and never used.

### Patch Changes

- [`f021eb5`](https://github.com/RumbleDB/language-tools/commit/f021eb55d688296104bf7835cebe0d40a3235113) - chore: upgrade dependencies of language server to the latest version
  
  fast-xml-parser: 5.11.0
  tsc-alias: 1.9.2
  tsx: 4.23.12
  vitest: 4.1.11

- [#56](https://github.com/RumbleDB/language-tools/pull/56) [`85d3b1b`](https://github.com/RumbleDB/language-tools/commit/85d3b1b041608d7c6e81a52c9db192910d1240ca) - refactor: reorganize different modules, make them more cohesive and easier to maintain.

## 2.9.0

### Minor Changes

- [#52](https://github.com/RumbleDB/language-tools/pull/52) [`25ed540`](https://github.com/RumbleDB/language-tools/commit/25ed540166cfabb68a49dbb28beceb4f5479dc74) - Add library-module parsing, import resolution, document links, and cross-file definitions, references, renames, and diagnostics for JSONiq and XQuery.

  Recognize module file extensions in VS Code and keep module analysis synchronized with open documents and workspace file changes.

- [#54](https://github.com/RumbleDB/language-tools/pull/54) [`dded099`](https://github.com/RumbleDB/language-tools/commit/dded0994fe19ab4b7f09866ea93f230e8cac26e6) - fix: declaration and variables in prolog does not have order

  "A variable initializer sees all functions, variables, and namespaces declared/imported anywhere in the Prolog—except the variable currently being initialized."

  "A declared function body sees all Prolog functions, variables, and namespaces, including itself."

- [#53](https://github.com/RumbleDB/language-tools/pull/53) [`1f2eb0c`](https://github.com/RumbleDB/language-tools/commit/1f2eb0cf2a94be4f707b5d956bab7fa58baace7d) - Extend module support from open documents to the entire workspace.

  The language server discovers JSONiq and XQuery files in workspace folders, indexes unopened library modules, and keeps the index synchronized with file and workspace-folder changes. Find References and Rename can therefore locate usages across files, including references from main modules to declarations exported by library modules.

  Workspace handling is separated into document storage, module resolution, dependency tracking, and symbol indexing. Analyses are cached and invalidated transitively when module dependencies change, open editor content takes precedence over disk content, and failures in individual files do not interrupt indexing of the remaining workspace. Module imports also provide document links and support resolving relative file locations

- [#51](https://github.com/RumbleDB/language-tools/pull/51) [`fe20e9a`](https://github.com/RumbleDB/language-tools/commit/fe20e9ae0729a5b2c2fe325d9c8040807042bd37) - refactor: remove `references` field from `Definition` type and `visibleFrom` from `BaseSourceDefinition`

- [#50](https://github.com/RumbleDB/language-tools/pull/50) [`a7a5c26`](https://github.com/RumbleDB/language-tools/commit/a7a5c26de4a36530bc4be52d0852c036d5502829) - refactor: classify definitions into `source`, `implicit` and `builtin`

  $err variable in catch blocks are implicit, but not builtin (it's still scope), this caused some problems with hover functionality (it was considering the whole catch block as selectionRange of the $err variable, which is not correct). Now, the hover functionality works correctly for $err variable in catch blocks.

- [#48](https://github.com/RumbleDB/language-tools/pull/48) [`2aa8734`](https://github.com/RumbleDB/language-tools/commit/2aa8734d98834939aec1af1058e4f5779d07301e) - Adds a new Wadler-style formatter for JSONiq and XQuery.

  It formats core queries, declarations, expressions, collections, scripting statements, and direct XML constructors with configurable indentation and line width. It preserves comments and whitespace-sensitive content such as XML text and string constructors.

  The formatter only runs on valid documents and is covered by parse, idempotence, and regression tests.

- [`f31310b`](https://github.com/RumbleDB/language-tools/commit/f31310bc5da52fbdb938664f5e2e8fb66edf297e) - Improved local development build performance by caching unchanged Java wrapper builds, reusing existing built-in catalogs, and enabling incremental TypeScript type-checking. Production builds continue to regenerate catalogs and bypass development caches.

  Added coordinated watch scripts, separated wrapper tests from development packaging while retaining full CI coverage, and cached the assembled RumbleDB JAR in CI. Also fixed production builds to use the extension’s production configuration.

## 2.8.1

### Patch Changes

- [`e0dafdb`](https://github.com/RumbleDB/language-tools/commit/e0dafdbe4aa2fef4e50e0f48bb74bd83b387a2d6) - Upgrade RumbleDB to https://github.com/RumbleDB/rumble/commit/b8542ba408571cd399611154d3380f460892d9a5

## 2.8.0

### Minor Changes

- [#40](https://github.com/RumbleDB/language-tools/pull/40) [`face347`](https://github.com/RumbleDB/language-tools/commit/face3475e15cf8491de49504fd46e43084a52b9c) - Remove useless `isTypeReferenceRule` check because the rules it is checking are not part of the preferred antlr4-C3 rules. Therefore, they will never pass the check.

- [#45](https://github.com/RumbleDB/language-tools/pull/45) [`4772a5e`](https://github.com/RumbleDB/language-tools/commit/4772a5e0750a571d3c87d142aa6580a0fbff8362) - Introduce full query execution support for JSONiq and XQuery files powered by RumbleDB, allowing users to run queries directly within VS Code and view formatted results in a side-by-side webview panel.

  The Java LSP wrapper now includes a dedicated `RunQuery` handler that executes JSONiq/XQuery scripts against the RumbleDB query engine and serializes execution results as structured JSON arrays.

  The Language Server protocol layer adds custom `runQuery` request handlers, protocol interfaces, and client execution helpers to bridge query execution requests between the editor client and the underlying Java wrapper process.

  The VS Code extension registers the `jsoniq.runQuery` command in editor context menus and title bars. It creates a new webview panel to display query results in a structured table format, powered by the new `@jsoniq/results-ui` webview package built with SolidJS and TanStack Table.

- [#43](https://github.com/RumbleDB/language-tools/pull/43) [`98207ed`](https://github.com/RumbleDB/language-tools/commit/98207ede10fe9f69b238587945ab2a189ddfad52) - Synced the JSONiq and XQuery grammars with RumbleDB, changing declaration sites to use `varBinding` so it's easier to distinguish between variable declaration and reference.

  Unified analysis variable definitions under a single variable kind, removing `declaration-kind` branching.

  Moved the definition of `visibleFrom` into the parser AST for more precise definition visibility.

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

### Patch Changes

- [#46](https://github.com/RumbleDB/language-tools/pull/46) [`6daad42`](https://github.com/RumbleDB/language-tools/commit/6daad428989fb8b129c62bc32563dcea38f37a7c) - Use pidusage to get memory usage information

  Because ps is not available on Windows machine and will cause the server to crash.

## 2.7.0

### Minor Changes

- [`ec151ab`](https://github.com/RumbleDB/language-tools/commit/ec151abab04a88a1849bf8d5d364af314e20e5b3) - refactor: rename `JsoniqAnalysis` type to `AnalysisResult`

- [`f4dc01d`](https://github.com/RumbleDB/language-tools/commit/f4dc01de2f4433c35c05c873d8afab4305063ba9) - refactor: remove unused `parent` field from `AstNodeBase`

- [#36](https://github.com/RumbleDB/language-tools/pull/36) [`56dcb12`](https://github.com/RumbleDB/language-tools/commit/56dcb12569f6de10276d38abf73c7e30ce659bbb) - feat: enhance TypeDefinition structure to support object and array types

- [`7da6f26`](https://github.com/RumbleDB/language-tools/commit/7da6f2693811857c2db77036bbb2e946b69dcb44) - refactor: rename `nameRange` to `selectionRange` in function-related AST nodes

- [`4bd1bd5`](https://github.com/RumbleDB/language-tools/commit/4bd1bd53010d48812a901bd29bc0465df977a543) - refactor: replace `JsoniqAst` type with `ModuleAstNode` in AST-related files

- [`0920e7a`](https://github.com/RumbleDB/language-tools/commit/0920e7a02eaba2d493923980a9b77c6331528ee0) - refactor: remove `JsoniqAst` type and replace with `ModuleNode` in analysis files

- [#34](https://github.com/RumbleDB/language-tools/pull/34) [`6fd4993`](https://github.com/RumbleDB/language-tools/commit/6fd4993e0efc6aa5900e25849b2ec27bc139099c) - Add type declaration and resolution support to the language server. Types are no longer treated as strings, but rather as structured objects with a QName. The LSP wrapper has been updated to reflect this change. Undo the change to the smaller .jar build in the LSP wrapper because it was causing a `ClassNotFoundException`.

- [#38](https://github.com/RumbleDB/language-tools/pull/38) [`883e9ee`](https://github.com/RumbleDB/language-tools/commit/883e9ee13c4ac9dc833fe6d54a2402c6a2749497) - feat: enrich completion intent with object lookup support

- [`7735ff6`](https://github.com/RumbleDB/language-tools/commit/7735ff6d9e9fc3d73a28927aa82b85bd59404aeb) - feat: add script to dump builtin types into assets folder

- [#37](https://github.com/RumbleDB/language-tools/pull/37) [`055992e`](https://github.com/RumbleDB/language-tools/commit/055992edc63cb03caee0c7eab36f650296a25abd) - Implement `type-at-position` request in the LSP wrapper, which returns the type of the **expression** at a given position in the document. The response includes the sequence type and the range of the expression.

  It has been integrated into the `hover` request, so that hovering over an expression will show its type.

  This change requires this pull request of RumbleDB to be merged first: https://github.com/RumbleDB/rumble/pull/1536

- [#35](https://github.com/RumbleDB/language-tools/pull/35) [`545f801`](https://github.com/RumbleDB/language-tools/commit/545f8017b87c1f53e3ebb212a5ffb2341d674885) - Add a Range record to the LSP wrapper to represent ranges in source code because more precise range information is now available in RumbleDB. Previously, we only had the start position; the end position was assumed to be the start of the next line.

### Patch Changes

- [`4e5afe2`](https://github.com/RumbleDB/language-tools/commit/4e5afe23f776f7a4721e9ad1556bc53e8b11f3ee) - chore: update dependencies

## 2.6.1

### Patch Changes

- [`5d355aa`](https://github.com/RumbleDB/language-tools/commit/5d355aa7a6fad992d7614cbc560c627e83a8ae6b) - fix: add support for URI-qualified QNames and enhance related tests

  Previously, URI-qualified QNames had the namespace URi removed in the parser layer. It was not resolving the following function name correctly:

  ```jsoniq
  Q{http://www.example.com}count(())                      (: Should give error but was not :)
  Q{http://www.w3.org/2005/xpath-functions}count(())      (: Should resolve correctly :)
  ```

- [`9d73984`](https://github.com/RumbleDB/language-tools/commit/9d73984a7277db2d6153a01fdf22d9fc6b77529d) - Add README to packages

- [`0bba37f`](https://github.com/RumbleDB/language-tools/commit/0bba37f0154e67055bbeb7bd030ac8f0c5a7f1ff) - Add Apache 2.0 license

## 2.6.0

### Minor Changes

- [`9b3258b`](https://github.com/RumbleDB/language-tools/commit/9b3258be20c0615497d1081afc29cc4e5cfc3c4d) - Restructure `getActiveParserId` function logic:

  1. If the document's language ID is neither JSONiq nor XQuery and the document is not part of a Jupyter Notebook cell, it is not supported by our language server.
  2. If the document contains 'jsoniq version' or 'xquery version', use the respective parser.
  3. Otherwise, fall back to the document's language ID property.

  We no longer check the file extension. This is because the VSCode extension (or other language server invoker) can do that.

- [#30](https://github.com/RumbleDB/language-tools/pull/30) [`55232dd`](https://github.com/RumbleDB/language-tools/commit/55232ddbe985ac2ce4b80f0e12156574ff9a6400) - feat: add the `analytics/visitor.ts` helper to visit the AST generated by `analytics/builder`. Switch the document symbol builder to consume this AST instead of the raw parser tree. This greatly simplifies the logic of the symbol builder.

- [#26](https://github.com/RumbleDB/language-tools/pull/26) [`4cab521`](https://github.com/RumbleDB/language-tools/commit/4cab5216c3ae1afd22e615a0bb0aa1b538cad4b3) - Refactor: Rename the type inference module to 'static-typecheck' and clean up the wrapper module code to focus only on connections and sending requests.

- [#28](https://github.com/RumbleDB/language-tools/pull/28) [`7bc3cb1`](https://github.com/RumbleDB/language-tools/commit/7bc3cb144dacce6e832b95e003ed141e0c01eda8) - Add a configuration that can enable or disable the LSP wrapper dynamically.

  Add more checks to ensure that, if the wrapper fails to start (e.g., if Java is unavailable), the language server itself can continue to work and bypass the failure.

- [`9ddb197`](https://github.com/RumbleDB/language-tools/commit/9ddb197fa1fc94f5018aeac6903b84bb1d22d657) - feat: use `connection.console` in logger utility. This allows logs to be filtered based on level in VSCode console panel.

- [#29](https://github.com/RumbleDB/language-tools/pull/29) [`a7c8267`](https://github.com/RumbleDB/language-tools/commit/a7c82679eb3bb9458c4f45b36fb6a24227ed5421) - Refactor: Create generic types for notification senders and receivers so that clients, such as the VSCode extension, can handle notifications in a type-safe manner.

## 2.5.0

### Minor Changes

- [#25](https://github.com/RumbleDB/language-tools/pull/25) [`67dec78`](https://github.com/RumbleDB/language-tools/commit/67dec78f5afb33a134ea542712b582063e9b0bd0) - refactor: make `getAnalysis` no longer asynchronous and remove the asynchronous mark from all caller functions

- [#24](https://github.com/RumbleDB/language-tools/pull/24) [`a784752`](https://github.com/RumbleDB/language-tools/commit/a784752010f391277d8e39738b8e0ccf3bca2e6a) - Pre-generate builtin functions JSON file and save it to `assets` folder.

  These functions are always the same for each version of the language server. Pre-generating them saves runtime and makes the wrapper solely responsible for static type checking, which is optional.

- [#22](https://github.com/RumbleDB/language-tools/pull/22) [`1b9b740`](https://github.com/RumbleDB/language-tools/commit/1b9b74082a213f14f235bc3cdc2afaee7446cd97) - Rename `TypeInferencer` to `StaticTypeChecker` and return all static errors (`RumbleException`) in the `error` field of the body object. Previously, these errors were returned in the `error` field of the top-level response object. This made it difficult to distinguish between an exception from Java and a static type error from Rumble.

### Patch Changes

- [`58d8c94`](https://github.com/RumbleDB/language-tools/commit/58d8c946202bf77324ef1c1ee517bb3f9d74733f) - fix language server being unresponsive with XQuery parser.

  The problem comes from string rules in XQuery grammar file (JSONiq grammar file does not have this problem). Language server is frozen generating completion items during `antlr4-c3.collectCandidates()` call, because the latest XQuery grammar tokenizes string content one character at a time as default-channel `ContentChar`, then gives c3 ambiguous ways to consume the same run of characters.

  XQuery strings are decomposed into many `ContentChar` tokens, and `ContentChar` is reachable through overlapping parser alternatives. c3 explores those alternatives while replaying the token stream up to the caret, causing **exponential** behavior.

## 2.4.1

### Patch Changes

- [`a88b1f2`](https://github.com/RumbleDB/language-tools/commit/a88b1f2c080f6b89feacfb863b4f33c733d5d4b3) - Correct the module path for `vscode-languageserver/node` to avoid an import error in the bundled version. It was previously imported as `vscode-languageserver/node.js`.

## 2.4.0

### Minor Changes

- [#20](https://github.com/RumbleDB/language-tools/pull/20) [`9fc6c51`](https://github.com/RumbleDB/language-tools/commit/9fc6c5190309107af0a76d1557b6dcce0b00f308) - Add XQuery to the VSCode extension language selector. It will be selected statically based on the file extension (see the VSCode extension's `package.json`) and dynamically based on the `ACTIVE_PARSER_NOTIFICATION` sent by the language server. Therefore, it can switch if the string `xquery version` is found in the document.

  Additionally, TextMate syntax has been added to enhance the syntax highlighting experience.

- [#18](https://github.com/RumbleDB/language-tools/pull/18) [`032ae0a`](https://github.com/RumbleDB/language-tools/commit/032ae0a109001e0c051f08fab66d9070f6938f63) - Add XQuery grammar support to the language server. The parser will activate if any of the following conditions are met (see `parser/xquery/index.ts`).

  1. The language ID is `xquery`.
  2. The document includes the string `xquery version`.
  3. The file extension is `.xq`, `.xqy`, or `.xquery`.

- [`f218779`](https://github.com/RumbleDB/language-tools/commit/f2187796b2218cc46f8ea6f3546f60357fd5fe7b) - Update the dependencies, including `vscode-languageserver` and `vscode-languageclient`, to version 10 in order to support the language server protocol version [3.18](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/) (released in 06/04/2026).

### Patch Changes

- [`202158e`](https://github.com/RumbleDB/language-tools/commit/202158ea6f44b6c46fb8cd9fb1510e4d17208b2e) - Add a `.npmignore` file to the `assets/function-doc` folder to ensure that the `custom-functions.json` file is uploaded to the npm registry.

  By default, because it's part of `.gitignore`, it is not uploaded.

## 2.3.0

### Minor Changes

- [`fedc643`](https://github.com/RumbleDB/language-tools/commit/fedc643229b0e4dc668c11174dc4d0353b171567) - refactor: create a AstVisitor class in parser module and refactor analysis builder and symbols with visitor pattern

- [#16](https://github.com/RumbleDB/language-tools/pull/16) [`a8c707e`](https://github.com/RumbleDB/language-tools/commit/a8c707e9feba1cbf7bcbbced7a513753ef78506b) - add trailing comma to grammar so incomplete function call can still get inline hint

- [#13](https://github.com/RumbleDB/language-tools/pull/13) [`bc8676e`](https://github.com/RumbleDB/language-tools/commit/bc8676e6fd04239f86d20bc458741f7dac0f71e6) - Refactor the analysis module to introduce an intermediate AST structure, migrate the analysis builder to use the visitor pattern, organize the module into separate types and query files, and streamline references and queries across the language server.

- [#17](https://github.com/RumbleDB/language-tools/pull/17) [`a368611`](https://github.com/RumbleDB/language-tools/commit/a36861112ab4b01482975ee6addadc07e70edf97) - Migrate to the latest version of JSONiq grammar file

- [#12](https://github.com/RumbleDB/language-tools/pull/12) [`f205855`](https://github.com/RumbleDB/language-tools/commit/f205855c963c13a8a237eaa3fbd838ed96400d88) - add QName support to language server

  Previously, the language server resolved names based on the prefix and local name, which could lead to incorrect resolutions in cases where the same local name was used with different prefixes. With the addition of QName support, the language server can now correctly resolve names based on the full qualified name, ensuring accurate name resolution even in cases where multiple prefixes are used. For example:

  ```jsoniq
  declare namespace aliasfn = "http://www.w3.org/2005/xpath-functions";
  let $a := aliasfn:local-name-from-QName(aliasfn:QName('https://example.com', 'test'))
  return $a
  ```

- [#15](https://github.com/RumbleDB/language-tools/pull/15) [`51f1800`](https://github.com/RumbleDB/language-tools/commit/51f18005769f32b92453385d8d352c452d1231ed) - add documentation for functions that are not part of W3 catalog. For example `jn:json-lines`.

- [`874a846`](https://github.com/RumbleDB/language-tools/commit/874a8466addb07c5aa136409bf6672712e2cc25a) - Inserts the full function call when performing function item completion.

  Previously, only the function name was inserted into the document. Now, it will insert the function signature with the fewest arguments.

- [#14](https://github.com/RumbleDB/language-tools/pull/14) [`560fc0a`](https://github.com/RumbleDB/language-tools/commit/560fc0a21312822da0fa56d75dea4e42c3e9fd7e) - Added a build script and runtime loader to compile custom function documentation from Markdown files with YAML frontmatter, stored in `docs/functions` folder.

### Patch Changes

- [`cae3951`](https://github.com/RumbleDB/language-tools/commit/cae395175e6ffe0d25e94292418d0766e59586dd) - refactor: use SemanticTokenTypes and SemanticTokenModifiers types from language server

## 2.2.0

### Minor Changes

- [`38ac971`](https://github.com/RumbleDB/language-tools/commit/38ac9710d8e741fe7b8fee0302230264b5ca68f0) - add signature help functionality and support for argument nodes for builtin functions via W3 catalog

- [`4984596`](https://github.com/RumbleDB/language-tools/commit/4984596d99b389fc5634ac8f9dee4cd510f275db) - enhance function completion items with markdown documentation

- [#10](https://github.com/RumbleDB/language-tools/pull/10) [`0213dc5`](https://github.com/RumbleDB/language-tools/commit/0213dc542b283bccc6b40ceda6f91e1e5dc05a15) - download w3 function catalog and display information on hover

- [`576c9ef`](https://github.com/RumbleDB/language-tools/commit/576c9ef25dda225ebc1da7ea1a4a7af89c788a0d) - implement inlay hints for function calls

- [`a40fe85`](https://github.com/RumbleDB/language-tools/commit/a40fe85e0d48db29c952761f32fea9230fce50b3) - collapse function overloads into a single completion item

## 2.1.0

### Minor Changes

- [#6](https://github.com/RumbleDB/language-tools/pull/6) [`3413d1b`](https://github.com/RumbleDB/language-tools/commit/3413d1b084d78d9d07af2d532a46a7f00bcedf94) - Save the `.jar` file of Rumble LSP Wrapper to the system cache folder so that it can persist across updates.

### Patch Changes

- [`157b40a`](https://github.com/RumbleDB/language-tools/commit/157b40a6728a8ee86c24699343f6dca9fc92796c) - Remove `.gitkeep` from assets folder and replace it with a README

## 2.0.1

### Patch Changes

- [`7455fec`](https://github.com/RumbleDB/language-tools/commit/7455fecc3cce7b279eba326e87a349e4df50783f) - Upgrade dependencies

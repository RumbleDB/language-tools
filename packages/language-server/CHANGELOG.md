# jsoniq-language-server

## 2.5.0

### Minor Changes

- [#25](https://github.com/RumbleDB/jsoniq-lsp/pull/25) [`67dec78`](https://github.com/RumbleDB/jsoniq-lsp/commit/67dec78f5afb33a134ea542712b582063e9b0bd0) - refactor: make `getAnalysis` no longer asynchronous and remove the asynchronous mark from all caller functions

- [#24](https://github.com/RumbleDB/jsoniq-lsp/pull/24) [`a784752`](https://github.com/RumbleDB/jsoniq-lsp/commit/a784752010f391277d8e39738b8e0ccf3bca2e6a) - Pre-generate builtin functions JSON file and save it to `assets` folder.

  These functions are always the same for each version of the language server. Pre-generating them saves runtime and makes the wrapper solely responsible for static type checking, which is optional.

- [#22](https://github.com/RumbleDB/jsoniq-lsp/pull/22) [`1b9b740`](https://github.com/RumbleDB/jsoniq-lsp/commit/1b9b74082a213f14f235bc3cdc2afaee7446cd97) - Rename `TypeInferencer` to `StaticTypeChecker` and return all static errors (`RumbleException`) in the `error` field of the body object. Previously, these errors were returned in the `error` field of the top-level response object. This made it difficult to distinguish between an exception from Java and a static type error from Rumble.

### Patch Changes

- [`58d8c94`](https://github.com/RumbleDB/jsoniq-lsp/commit/58d8c946202bf77324ef1c1ee517bb3f9d74733f) - fix language server being unresponsive with XQuery parser.

  The problem comes from string rules in XQuery grammar file (JSONiq grammar file does not have this problem). Language server is frozen generating completion items during `antlr4-c3.collectCandidates()` call, because the latest XQuery grammar tokenizes string content one character at a time as default-channel `ContentChar`, then gives c3 ambiguous ways to consume the same run of characters.

  XQuery strings are decomposed into many `ContentChar` tokens, and `ContentChar` is reachable through overlapping parser alternatives. c3 explores those alternatives while replaying the token stream up to the caret, causing **exponential** behavior.

## 2.4.1

### Patch Changes

- [`a88b1f2`](https://github.com/RumbleDB/jsoniq-lsp/commit/a88b1f2c080f6b89feacfb863b4f33c733d5d4b3) - Correct the module path for `vscode-languageserver/node` to avoid an import error in the bundled version. It was previously imported as `vscode-languageserver/node.js`.

## 2.4.0

### Minor Changes

- [#20](https://github.com/RumbleDB/jsoniq-lsp/pull/20) [`9fc6c51`](https://github.com/RumbleDB/jsoniq-lsp/commit/9fc6c5190309107af0a76d1557b6dcce0b00f308) - Add XQuery to the VSCode extension language selector. It will be selected statically based on the file extension (see the VSCode extension's `package.json`) and dynamically based on the `ACTIVE_PARSER_NOTIFICATION` sent by the language server. Therefore, it can switch if the string `xquery version` is found in the document.

  Additionally, TextMate syntax has been added to enhance the syntax highlighting experience.

- [#18](https://github.com/RumbleDB/jsoniq-lsp/pull/18) [`032ae0a`](https://github.com/RumbleDB/jsoniq-lsp/commit/032ae0a109001e0c051f08fab66d9070f6938f63) - Add XQuery grammar support to the language server. The parser will activate if any of the following conditions are met (see `parser/xquery/index.ts`).

  1. The language ID is `xquery`.
  2. The document includes the string `xquery version`.
  3. The file extension is `.xq`, `.xqy`, or `.xquery`.

- [`f218779`](https://github.com/RumbleDB/jsoniq-lsp/commit/f2187796b2218cc46f8ea6f3546f60357fd5fe7b) - Update the dependencies, including `vscode-languageserver` and `vscode-languageclient`, to version 10 in order to support the language server protocol version [3.18](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/) (released in 06/04/2026).

### Patch Changes

- [`202158e`](https://github.com/RumbleDB/jsoniq-lsp/commit/202158ea6f44b6c46fb8cd9fb1510e4d17208b2e) - Add a `.npmignore` file to the `assets/function-doc` folder to ensure that the `custom-functions.json` file is uploaded to the npm registry.

  By default, because it's part of `.gitignore`, it is not uploaded.

## 2.3.0

### Minor Changes

- [`fedc643`](https://github.com/RumbleDB/jsoniq-lsp/commit/fedc643229b0e4dc668c11174dc4d0353b171567) - refactor: create a AstVisitor class in parser module and refactor analysis builder and symbols with visitor pattern

- [#16](https://github.com/RumbleDB/jsoniq-lsp/pull/16) [`a8c707e`](https://github.com/RumbleDB/jsoniq-lsp/commit/a8c707e9feba1cbf7bcbbced7a513753ef78506b) - add trailing comma to grammar so incomplete function call can still get inline hint

- [#13](https://github.com/RumbleDB/jsoniq-lsp/pull/13) [`bc8676e`](https://github.com/RumbleDB/jsoniq-lsp/commit/bc8676e6fd04239f86d20bc458741f7dac0f71e6) - Refactor the analysis module to introduce an intermediate AST structure, migrate the analysis builder to use the visitor pattern, organize the module into separate types and query files, and streamline references and queries across the language server.

- [#17](https://github.com/RumbleDB/jsoniq-lsp/pull/17) [`a368611`](https://github.com/RumbleDB/jsoniq-lsp/commit/a36861112ab4b01482975ee6addadc07e70edf97) - Migrate to the latest version of JSONiq grammar file

- [#12](https://github.com/RumbleDB/jsoniq-lsp/pull/12) [`f205855`](https://github.com/RumbleDB/jsoniq-lsp/commit/f205855c963c13a8a237eaa3fbd838ed96400d88) - add QName support to language server

  Previously, the language server resolved names based on the prefix and local name, which could lead to incorrect resolutions in cases where the same local name was used with different prefixes. With the addition of QName support, the language server can now correctly resolve names based on the full qualified name, ensuring accurate name resolution even in cases where multiple prefixes are used. For example:

  ```jsoniq
  declare namespace aliasfn = "http://www.w3.org/2005/xpath-functions";
  let $a := aliasfn:local-name-from-QName(aliasfn:QName('https://example.com', 'test'))
  return $a
  ```

- [#15](https://github.com/RumbleDB/jsoniq-lsp/pull/15) [`51f1800`](https://github.com/RumbleDB/jsoniq-lsp/commit/51f18005769f32b92453385d8d352c452d1231ed) - add documentation for functions that are not part of W3 catalog. For example `jn:json-lines`.

- [`874a846`](https://github.com/RumbleDB/jsoniq-lsp/commit/874a8466addb07c5aa136409bf6672712e2cc25a) - Inserts the full function call when performing function item completion.

  Previously, only the function name was inserted into the document. Now, it will insert the function signature with the fewest arguments.

- [#14](https://github.com/RumbleDB/jsoniq-lsp/pull/14) [`560fc0a`](https://github.com/RumbleDB/jsoniq-lsp/commit/560fc0a21312822da0fa56d75dea4e42c3e9fd7e) - Added a build script and runtime loader to compile custom function documentation from Markdown files with YAML frontmatter, stored in `docs/functions` folder.

### Patch Changes

- [`cae3951`](https://github.com/RumbleDB/jsoniq-lsp/commit/cae395175e6ffe0d25e94292418d0766e59586dd) - refactor: use SemanticTokenTypes and SemanticTokenModifiers types from language server

## 2.2.0

### Minor Changes

- [`38ac971`](https://github.com/RumbleDB/jsoniq-lsp/commit/38ac9710d8e741fe7b8fee0302230264b5ca68f0) - add signature help functionality and support for argument nodes for builtin functions via W3 catalog

- [`4984596`](https://github.com/RumbleDB/jsoniq-lsp/commit/4984596d99b389fc5634ac8f9dee4cd510f275db) - enhance function completion items with markdown documentation

- [#10](https://github.com/RumbleDB/jsoniq-lsp/pull/10) [`0213dc5`](https://github.com/RumbleDB/jsoniq-lsp/commit/0213dc542b283bccc6b40ceda6f91e1e5dc05a15) - download w3 function catalog and display information on hover

- [`576c9ef`](https://github.com/RumbleDB/jsoniq-lsp/commit/576c9ef25dda225ebc1da7ea1a4a7af89c788a0d) - implement inlay hints for function calls

- [`a40fe85`](https://github.com/RumbleDB/jsoniq-lsp/commit/a40fe85e0d48db29c952761f32fea9230fce50b3) - collapse function overloads into a single completion item

## 2.1.0

### Minor Changes

- [#6](https://github.com/RumbleDB/jsoniq-lsp/pull/6) [`3413d1b`](https://github.com/RumbleDB/jsoniq-lsp/commit/3413d1b084d78d9d07af2d532a46a7f00bcedf94) - Save the `.jar` file of Rumble LSP Wrapper to the system cache folder so that it can persist across updates.

### Patch Changes

- [`157b40a`](https://github.com/RumbleDB/jsoniq-lsp/commit/157b40a6728a8ee86c24699343f6dca9fc92796c) - Remove `.gitkeep` from assets folder and replace it with a README

## 2.0.1

### Patch Changes

- [`7455fec`](https://github.com/RumbleDB/jsoniq-lsp/commit/7455fecc3cce7b279eba326e87a349e4df50783f) - Upgrade dependencies

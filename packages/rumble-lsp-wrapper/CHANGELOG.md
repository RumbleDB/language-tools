# rumble-lsp-wrapper

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

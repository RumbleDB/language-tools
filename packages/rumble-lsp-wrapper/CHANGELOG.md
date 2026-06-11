# rumble-lsp-wrapper

## 0.3.0

### Minor Changes

- [#12](https://github.com/RumbleDB/jsoniq-lsp/pull/12) [`f205855`](https://github.com/RumbleDB/jsoniq-lsp/commit/f205855c963c13a8a237eaa3fbd838ed96400d88) - add QName support to language server

  Previously, the language server resolved names based on the prefix and local name, which could lead to incorrect resolutions in cases where the same local name was used with different prefixes. With the addition of QName support, the language server can now correctly resolve names based on the full qualified name, ensuring accurate name resolution even in cases where multiple prefixes are used. For example:

  ```jsoniq
  declare namespace aliasfn = "http://www.w3.org/2005/xpath-functions";
  let $a := aliasfn:local-name-from-QName(aliasfn:QName('https://example.com', 'test'))
  return $a
  ```

## 0.2.0

### Minor Changes

- [`18c9df9`](https://github.com/RumbleDB/jsoniq-lsp/commit/18c9df97bbebc43a6e455705c6596d26eb6c35dd) - Upgrade to latest master commit of RumbleDB ([21022a95493edad91b15861c52cd55884c3d42db](https://github.com/RumbleDB/rumble/commit/21022a95493edad91b15861c52cd55884c3d42db))

### Patch Changes

- [#8](https://github.com/RumbleDB/jsoniq-lsp/pull/8) [`a7d9025`](https://github.com/RumbleDB/jsoniq-lsp/commit/a7d90253d751166e0a1639cfd634e19ac4628591) - rename package from `org.jsoniq.lsp.rumble` to `org.jsoniq.lsp.wrapper`

## 0.1.2

### Patch Changes

- [`d9d30f3`](https://github.com/RumbleDB/jsoniq-lsp/commit/d9d30f31f82165439b45d54636be48ae807cb0c2) - fix the commit hash of RumbleDB in `fetch-rumble.sh` script to make build reproducible

## 0.1.1

### Patch Changes

- [#2](https://github.com/RumbleDB/jsoniq-lsp/pull/2) [`2c0b7e0`](https://github.com/RumbleDB/jsoniq-lsp/commit/2c0b7e0f252ec9c524986f949aedfb1ada2af378) Thanks [@CaiJimmy](https://github.com/CaiJimmy)! - Add `package.json` to rumble-lsp-wrapper, so it can have it's own version number and release cycle.

  One advantage of this is that the release of Rumble LSP Wrapper can be decoupled from the release of language servers. This means we can release language servers without rebuilding Rumble LSP Wrapper if it hasn't changed. This avoids re-downloading the .jar file for rumble-lsp-wrapper when no changes have been made, which can save users who have already downloaded it a lot of time and bandwidth.

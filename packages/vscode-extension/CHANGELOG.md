# jsoniq-vscode

## 1.2.0

### Minor Changes

- [`3304720`](https://github.com/RumbleDB/jsoniq-lsp/commit/3304720852ad11cbc11d2284f7889d75d4c48183) - add function-calls rule to TextMate highlight

  Now all function calls should be highlighted in the editor inmediately, without the need to wait for the language server to respond.

### Patch Changes

- Updated dependencies [[`fedc643`](https://github.com/RumbleDB/jsoniq-lsp/commit/fedc643229b0e4dc668c11174dc4d0353b171567), [`cae3951`](https://github.com/RumbleDB/jsoniq-lsp/commit/cae395175e6ffe0d25e94292418d0766e59586dd), [`a8c707e`](https://github.com/RumbleDB/jsoniq-lsp/commit/a8c707e9feba1cbf7bcbbced7a513753ef78506b), [`bc8676e`](https://github.com/RumbleDB/jsoniq-lsp/commit/bc8676e6fd04239f86d20bc458741f7dac0f71e6), [`a368611`](https://github.com/RumbleDB/jsoniq-lsp/commit/a36861112ab4b01482975ee6addadc07e70edf97), [`f205855`](https://github.com/RumbleDB/jsoniq-lsp/commit/f205855c963c13a8a237eaa3fbd838ed96400d88), [`51f1800`](https://github.com/RumbleDB/jsoniq-lsp/commit/51f18005769f32b92453385d8d352c452d1231ed), [`874a846`](https://github.com/RumbleDB/jsoniq-lsp/commit/874a8466addb07c5aa136409bf6672712e2cc25a), [`560fc0a`](https://github.com/RumbleDB/jsoniq-lsp/commit/560fc0a21312822da0fa56d75dea4e42c3e9fd7e)]:
  - jsoniq-language-server@2.3.0

## 1.1.1

### Patch Changes

- Updated dependencies [[`38ac971`](https://github.com/RumbleDB/jsoniq-lsp/commit/38ac9710d8e741fe7b8fee0302230264b5ca68f0), [`4984596`](https://github.com/RumbleDB/jsoniq-lsp/commit/4984596d99b389fc5634ac8f9dee4cd510f275db), [`0213dc5`](https://github.com/RumbleDB/jsoniq-lsp/commit/0213dc542b283bccc6b40ceda6f91e1e5dc05a15), [`576c9ef`](https://github.com/RumbleDB/jsoniq-lsp/commit/576c9ef25dda225ebc1da7ea1a4a7af89c788a0d), [`a40fe85`](https://github.com/RumbleDB/jsoniq-lsp/commit/a40fe85e0d48db29c952761f32fea9230fce50b3)]:
  - jsoniq-language-server@2.2.0

## 1.1.0

### Minor Changes

- [#6](https://github.com/RumbleDB/jsoniq-lsp/pull/6) [`1b7ae6b`](https://github.com/RumbleDB/jsoniq-lsp/commit/1b7ae6b832bf1662683150083ae1249a1eb7b08b) - Save `.jar` file downloaded by the language server into `globalStoragePath` so it can persist across updates

### Patch Changes

- [`0cb4225`](https://github.com/RumbleDB/jsoniq-lsp/commit/0cb4225d1ab55a763403ffb1c4d2cb5c99afbe5f) - change the download message title to "Downloading RumbleDB wrapper"

- Updated dependencies [[`157b40a`](https://github.com/RumbleDB/jsoniq-lsp/commit/157b40a6728a8ee86c24699343f6dca9fc92796c), [`3413d1b`](https://github.com/RumbleDB/jsoniq-lsp/commit/3413d1b084d78d9d07af2d532a46a7f00bcedf94)]:
  - jsoniq-language-server@2.1.0

## 1.0.3

### Patch Changes

- [`1736f9d`](https://github.com/RumbleDB/jsoniq-lsp/commit/1736f9d7fb44da1356c3020e4f86d3738aad2873) - upgrade engines.vscode to 1.120.0 to align with @types/vscode

## 1.0.2

### Patch Changes

- [`7455fec`](https://github.com/RumbleDB/jsoniq-lsp/commit/7455fecc3cce7b279eba326e87a349e4df50783f) - Upgrade dependencies

- Updated dependencies [[`7455fec`](https://github.com/RumbleDB/jsoniq-lsp/commit/7455fecc3cce7b279eba326e87a349e4df50783f)]:
  - jsoniq-language-server@2.0.1

## 1.0.1

### Patch Changes

- d4f4632: Change the display name of VSCode extension to _JSONiq Language Support_ to avoid conflict with the old plugin.

  We will see if it is possible to recover the shorter display name later.

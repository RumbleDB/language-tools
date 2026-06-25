# jsoniq-vscode

## 1.4.2

### Patch Changes

- [`4e5afe2`](https://github.com/RumbleDB/language-tools/commit/4e5afe23f776f7a4721e9ad1556bc53e8b11f3ee) - chore: update dependencies

- Updated dependencies [[`ec151ab`](https://github.com/RumbleDB/language-tools/commit/ec151abab04a88a1849bf8d5d364af314e20e5b3), [`f4dc01d`](https://github.com/RumbleDB/language-tools/commit/f4dc01de2f4433c35c05c873d8afab4305063ba9), [`4e5afe2`](https://github.com/RumbleDB/language-tools/commit/4e5afe23f776f7a4721e9ad1556bc53e8b11f3ee), [`56dcb12`](https://github.com/RumbleDB/language-tools/commit/56dcb12569f6de10276d38abf73c7e30ce659bbb), [`7da6f26`](https://github.com/RumbleDB/language-tools/commit/7da6f2693811857c2db77036bbb2e946b69dcb44), [`4bd1bd5`](https://github.com/RumbleDB/language-tools/commit/4bd1bd53010d48812a901bd29bc0465df977a543), [`0920e7a`](https://github.com/RumbleDB/language-tools/commit/0920e7a02eaba2d493923980a9b77c6331528ee0), [`6fd4993`](https://github.com/RumbleDB/language-tools/commit/6fd4993e0efc6aa5900e25849b2ec27bc139099c), [`883e9ee`](https://github.com/RumbleDB/language-tools/commit/883e9ee13c4ac9dc833fe6d54a2402c6a2749497), [`7735ff6`](https://github.com/RumbleDB/language-tools/commit/7735ff6d9e9fc3d73a28927aa82b85bd59404aeb), [`055992e`](https://github.com/RumbleDB/language-tools/commit/055992edc63cb03caee0c7eab36f650296a25abd), [`545f801`](https://github.com/RumbleDB/language-tools/commit/545f8017b87c1f53e3ebb212a5ffb2341d674885)]:
  - jsoniq-language-server@2.7.0

## 1.4.1

### Patch Changes

- [`9d73984`](https://github.com/RumbleDB/language-tools/commit/9d73984a7277db2d6153a01fdf22d9fc6b77529d) - Add README to packages

- [`bc1de1d`](https://github.com/RumbleDB/language-tools/commit/bc1de1d13f9329d9e151066422256e23afef7fc9) - Rename the extension to "JSONiq and XQuery Language Support" and provide a new description.

- [`0bba37f`](https://github.com/RumbleDB/language-tools/commit/0bba37f0154e67055bbeb7bd030ac8f0c5a7f1ff) - Add Apache 2.0 license

- Updated dependencies [[`5d355aa`](https://github.com/RumbleDB/language-tools/commit/5d355aa7a6fad992d7614cbc560c627e83a8ae6b), [`9d73984`](https://github.com/RumbleDB/language-tools/commit/9d73984a7277db2d6153a01fdf22d9fc6b77529d), [`0bba37f`](https://github.com/RumbleDB/language-tools/commit/0bba37f0154e67055bbeb7bd030ac8f0c5a7f1ff)]:
  - jsoniq-language-server@2.6.1

## 1.4.0

### Minor Changes

- [`62ef882`](https://github.com/RumbleDB/language-tools/commit/62ef88215c9bee6eec39367ddd41cabb2fa5cdb8) - feat: change transport method from stdio to ipc in serverOptions for improved communication

- [#28](https://github.com/RumbleDB/language-tools/pull/28) [`7bc3cb1`](https://github.com/RumbleDB/language-tools/commit/7bc3cb144dacce6e832b95e003ed141e0c01eda8) - Add a configuration that can enable or disable the LSP wrapper dynamically.

  Add more checks to ensure that, if the wrapper fails to start (e.g., if Java is unavailable), the language server itself can continue to work and bypass the failure.

- [#29](https://github.com/RumbleDB/language-tools/pull/29) [`a7c8267`](https://github.com/RumbleDB/language-tools/commit/a7c82679eb3bb9458c4f45b36fb6a24227ed5421) - Refactor: Create generic types for notification senders and receivers so that clients, such as the VSCode extension, can handle notifications in a type-safe manner.

### Patch Changes

- [`51b770f`](https://github.com/RumbleDB/language-tools/commit/51b770f1a8a6c77f34912ea2eb27af3cd9062372) - fix: do not switch document language automatically if it was not JSONiq or XQuery

  This prevents problem with Jupyter Notebook cell, which is set to use Python language

- Updated dependencies [[`9b3258b`](https://github.com/RumbleDB/language-tools/commit/9b3258be20c0615497d1081afc29cc4e5cfc3c4d), [`55232dd`](https://github.com/RumbleDB/language-tools/commit/55232ddbe985ac2ce4b80f0e12156574ff9a6400), [`4cab521`](https://github.com/RumbleDB/language-tools/commit/4cab5216c3ae1afd22e615a0bb0aa1b538cad4b3), [`7bc3cb1`](https://github.com/RumbleDB/language-tools/commit/7bc3cb144dacce6e832b95e003ed141e0c01eda8), [`9ddb197`](https://github.com/RumbleDB/language-tools/commit/9ddb197fa1fc94f5018aeac6903b84bb1d22d657), [`a7c8267`](https://github.com/RumbleDB/language-tools/commit/a7c82679eb3bb9458c4f45b36fb6a24227ed5421)]:
  - jsoniq-language-server@2.6.0

## 1.3.2

### Patch Changes

- Updated dependencies [[`67dec78`](https://github.com/RumbleDB/language-tools/commit/67dec78f5afb33a134ea542712b582063e9b0bd0), [`a784752`](https://github.com/RumbleDB/language-tools/commit/a784752010f391277d8e39738b8e0ccf3bca2e6a), [`58d8c94`](https://github.com/RumbleDB/language-tools/commit/58d8c946202bf77324ef1c1ee517bb3f9d74733f), [`1b9b740`](https://github.com/RumbleDB/language-tools/commit/1b9b74082a213f14f235bc3cdc2afaee7446cd97)]:
  - jsoniq-language-server@2.5.0

## 1.3.1

### Patch Changes

- Updated dependencies [[`a88b1f2`](https://github.com/RumbleDB/language-tools/commit/a88b1f2c080f6b89feacfb863b4f33c733d5d4b3)]:
  - jsoniq-language-server@2.4.1

## 1.3.0

### Minor Changes

- [#20](https://github.com/RumbleDB/language-tools/pull/20) [`9fc6c51`](https://github.com/RumbleDB/language-tools/commit/9fc6c5190309107af0a76d1557b6dcce0b00f308) - Add XQuery to the VSCode extension language selector. It will be selected statically based on the file extension (see the VSCode extension's `package.json`) and dynamically based on the `ACTIVE_PARSER_NOTIFICATION` sent by the language server. Therefore, it can switch if the string `xquery version` is found in the document.

  Additionally, TextMate syntax has been added to enhance the syntax highlighting experience.

- [`996b40e`](https://github.com/RumbleDB/language-tools/commit/996b40e000fe7a2b2fd6acb19e982633c6ed7ab4) - Improve the JSONiq TextMate syntax to align with the latest grammar version.

- [`f218779`](https://github.com/RumbleDB/language-tools/commit/f2187796b2218cc46f8ea6f3546f60357fd5fe7b) - Update the dependencies, including `vscode-languageserver` and `vscode-languageclient`, to version 10 in order to support the language server protocol version [3.18](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/) (released in 06/04/2026).

### Patch Changes

- Updated dependencies [[`202158e`](https://github.com/RumbleDB/language-tools/commit/202158ea6f44b6c46fb8cd9fb1510e4d17208b2e), [`9fc6c51`](https://github.com/RumbleDB/language-tools/commit/9fc6c5190309107af0a76d1557b6dcce0b00f308), [`032ae0a`](https://github.com/RumbleDB/language-tools/commit/032ae0a109001e0c051f08fab66d9070f6938f63), [`f218779`](https://github.com/RumbleDB/language-tools/commit/f2187796b2218cc46f8ea6f3546f60357fd5fe7b)]:
  - jsoniq-language-server@2.4.0

## 1.2.0

### Minor Changes

- [`3304720`](https://github.com/RumbleDB/language-tools/commit/3304720852ad11cbc11d2284f7889d75d4c48183) - add function-calls rule to TextMate highlight

  Now all function calls should be highlighted in the editor inmediately, without the need to wait for the language server to respond.

### Patch Changes

- Updated dependencies [[`fedc643`](https://github.com/RumbleDB/language-tools/commit/fedc643229b0e4dc668c11174dc4d0353b171567), [`cae3951`](https://github.com/RumbleDB/language-tools/commit/cae395175e6ffe0d25e94292418d0766e59586dd), [`a8c707e`](https://github.com/RumbleDB/language-tools/commit/a8c707e9feba1cbf7bcbbced7a513753ef78506b), [`bc8676e`](https://github.com/RumbleDB/language-tools/commit/bc8676e6fd04239f86d20bc458741f7dac0f71e6), [`a368611`](https://github.com/RumbleDB/language-tools/commit/a36861112ab4b01482975ee6addadc07e70edf97), [`f205855`](https://github.com/RumbleDB/language-tools/commit/f205855c963c13a8a237eaa3fbd838ed96400d88), [`51f1800`](https://github.com/RumbleDB/language-tools/commit/51f18005769f32b92453385d8d352c452d1231ed), [`874a846`](https://github.com/RumbleDB/language-tools/commit/874a8466addb07c5aa136409bf6672712e2cc25a), [`560fc0a`](https://github.com/RumbleDB/language-tools/commit/560fc0a21312822da0fa56d75dea4e42c3e9fd7e)]:
  - jsoniq-language-server@2.3.0

## 1.1.1

### Patch Changes

- Updated dependencies [[`38ac971`](https://github.com/RumbleDB/language-tools/commit/38ac9710d8e741fe7b8fee0302230264b5ca68f0), [`4984596`](https://github.com/RumbleDB/language-tools/commit/4984596d99b389fc5634ac8f9dee4cd510f275db), [`0213dc5`](https://github.com/RumbleDB/language-tools/commit/0213dc542b283bccc6b40ceda6f91e1e5dc05a15), [`576c9ef`](https://github.com/RumbleDB/language-tools/commit/576c9ef25dda225ebc1da7ea1a4a7af89c788a0d), [`a40fe85`](https://github.com/RumbleDB/language-tools/commit/a40fe85e0d48db29c952761f32fea9230fce50b3)]:
  - jsoniq-language-server@2.2.0

## 1.1.0

### Minor Changes

- [#6](https://github.com/RumbleDB/language-tools/pull/6) [`1b7ae6b`](https://github.com/RumbleDB/language-tools/commit/1b7ae6b832bf1662683150083ae1249a1eb7b08b) - Save `.jar` file downloaded by the language server into `globalStoragePath` so it can persist across updates

### Patch Changes

- [`0cb4225`](https://github.com/RumbleDB/language-tools/commit/0cb4225d1ab55a763403ffb1c4d2cb5c99afbe5f) - change the download message title to "Downloading RumbleDB wrapper"

- Updated dependencies [[`157b40a`](https://github.com/RumbleDB/language-tools/commit/157b40a6728a8ee86c24699343f6dca9fc92796c), [`3413d1b`](https://github.com/RumbleDB/language-tools/commit/3413d1b084d78d9d07af2d532a46a7f00bcedf94)]:
  - jsoniq-language-server@2.1.0

## 1.0.3

### Patch Changes

- [`1736f9d`](https://github.com/RumbleDB/language-tools/commit/1736f9d7fb44da1356c3020e4f86d3738aad2873) - upgrade engines.vscode to 1.120.0 to align with @types/vscode

## 1.0.2

### Patch Changes

- [`7455fec`](https://github.com/RumbleDB/language-tools/commit/7455fecc3cce7b279eba326e87a349e4df50783f) - Upgrade dependencies

- Updated dependencies [[`7455fec`](https://github.com/RumbleDB/language-tools/commit/7455fecc3cce7b279eba326e87a349e4df50783f)]:
  - jsoniq-language-server@2.0.1

## 1.0.1

### Patch Changes

- d4f4632: Change the display name of VSCode extension to _JSONiq Language Support_ to avoid conflict with the old plugin.

  We will see if it is possible to recover the shorter display name later.

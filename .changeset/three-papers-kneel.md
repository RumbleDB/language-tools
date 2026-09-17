---
"jsoniq-language-server": patch
"jsoniq-vscode": patch
---

chore(deps): upgrade all dependencies and migrate results-ui to TanStack Table v9

- Bump @tanstack/solid-table 8 → 9 (breaking) and migrate `results-ui` source code to the v9 API (createTable, tableFeatures, FlexRender)
- Bump vite 6 → 8, typescript 5 → 7, vitest 4 → 5 in results-ui / language-server
- Bump solid-js, unocss, rolldown, tsc-alias, tsdown, tsx, and LSP packages
- Bump catalog shared tools: @types/node, oxfmt, oxlint
- Bump root dev tools: @changesets/cli, @changesets/changelog-github, lint-staged

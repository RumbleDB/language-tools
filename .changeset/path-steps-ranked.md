---
"jsoniq-language-server": patch
---

fix: rank schema-declared path steps first instead of hiding other suggestions, so functions such as `data()` remain available after `/`, including after an element without children

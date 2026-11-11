---
"jsoniq-language-server": minor
---

Keep large inferred types, such as the schema of a Parquet file, readable: completion details fit a wide object on one line by hiding nested objects, then field types, then fields (`{ id?, actor?, repo?, … 2 more }`), and hover indents nested objects as deep as fits in 40 lines.

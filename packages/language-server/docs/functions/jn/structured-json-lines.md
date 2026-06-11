---
name: "structured-json-lines"
prefix: "jn"
summary: "Parses structured JSON Lines files into a DataFrame."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
---

## Rules

Parses files at `$path` containing JSON objects with a consistent schema. Utilizes Spark DataFrames for optimized, faster execution.

## Examples

```jsoniq
jn:structured-json-lines("data.json")
```

---
name: "structured-json-file"
prefix: "jn"
summary: "Deprecated alias for structured-json-lines."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
---

## Rules

Deprecated function. Use `jn:structured-json-lines()` instead.

## Examples

```jsoniq
jn:structured-json-file("data.json")
```

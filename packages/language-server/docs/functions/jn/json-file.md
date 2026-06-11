---
name: "json-file"
prefix: "jn"
summary: "Deprecated alias for json-lines."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
    - params:
          - name: "path"
            type: "xs:string"
          - name: "partitions"
            type: "xs:integer?"
      returnType: "item*"
---

## Rules

Deprecated function. Use `jn:json-lines()` instead.

## Examples

```jsoniq
jn:json-file("file.json")
```

---
name: "json-lines"
prefix: "jn"
summary: "Parses one or more JSON Lines files."
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

Reads JSON Lines files from path `$path` (one object per line) and returns a parallelized sequence of objects. `$partitions` specifies the minimum partitions count.

## Examples

```jsoniq
jn:json-lines("data.json", 10)
```

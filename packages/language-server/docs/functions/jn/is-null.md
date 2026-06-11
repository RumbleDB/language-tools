---
name: "is-null"
prefix: "jn"
summary: "Checks if the input is a single JSON null value."
signatures:
    - params:
          - name: "item"
            type: "item*"
      returnType: "xs:boolean"
---

## Rules

Returns `true` if `$item` is exactly a single JSON null item, and `false` otherwise.

## Examples

```jsoniq
jn:is-null(jn:null())
=> true
```

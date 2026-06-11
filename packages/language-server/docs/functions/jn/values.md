---
name: "values"
prefix: "jn"
summary: "Returns the values of the JSON object(s)."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
      returnType: "item*"
---

## Rules

Returns the values of all fields from all object items in `$sequence`. Non-object items are ignored.

## Examples

```jsoniq
jn:values({"a": 1, "b": 2})
=> 1, 2
```

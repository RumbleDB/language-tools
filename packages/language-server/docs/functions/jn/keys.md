---
name: "keys"
prefix: "jn"
summary: "Returns the keys of the JSON object(s)."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
      returnType: "xs:string*"
---

## Rules

Returns a sequence of keys from all object items in `$sequence`. Non-object items are ignored.

## Examples

```jsoniq
jn:keys({"a": 1, "b": 2})
=> "a", "b"
```

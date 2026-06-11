---
name: "remove-keys"
prefix: "jn"
summary: "Removes specified keys from objects."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
          - name: "keys"
            type: "xs:string*"
      returnType: "item*"
---

## Rules

Removes key-value pairs from objects in `$sequence` whose keys are specified in `$keys`. Non-object items are returned unchanged.

## Examples

```jsoniq
jn:remove-keys({"a": 1, "b": 2, "c": 3}, "b")
=> {"a": 1, "c": 3}
```

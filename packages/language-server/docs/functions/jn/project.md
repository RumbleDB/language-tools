---
name: "project"
prefix: "jn"
summary: "Filters key-value pairs of objects by keeping only specified keys."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
          - name: "keys"
            type: "xs:string*"
      returnType: "item*"
---

## Rules

Keeps only key-value pairs in `$sequence` whose keys are in the sequence `$keys`. Non-object items are returned unchanged.

## Examples

```jsoniq
jn:project({"a": 1, "b": 2, "c": 3}, ("a", "c"))
=> {"a": 1, "c": 3}
```

---
name: "descendant-pairs"
prefix: "jn"
summary: "Returns all key-value pairs (as single-key objects) contained within the input."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
      returnType: "item*"
---

## Rules

Recursively traverses the input sequence `$sequence` and returns all key-value pairs (each wrapped as an object containing a single key).

## Examples

```jsoniq
jn:descendant-pairs({"a": 1, "b": {"c": 2}})
=> {"a": 1}, {"b": {"c": 2}}, {"c": 2}
```

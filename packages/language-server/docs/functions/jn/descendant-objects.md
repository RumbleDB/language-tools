---
name: "descendant-objects"
prefix: "jn"
summary: "Returns all objects contained within the input, regardless of depth."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
      returnType: "item*"
---

## Rules

Recursively traverses the input sequence `$sequence` and returns all JSON objects found within other items.

## Examples

```jsoniq
jn:descendant-objects(([{"a": 1}], {"b": {"c": 2}}))
=> {"a": 1}, {"b": {"c": 2}}, {"c": 2}
```

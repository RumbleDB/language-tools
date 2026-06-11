---
name: "descendant-arrays"
prefix: "jn"
summary: "Returns all arrays contained within the input, regardless of depth."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
      returnType: "item*"
---

## Rules

Recursively traverses the input sequence `$sequence` and returns all JSON arrays found within other items.

## Examples

```jsoniq
jn:descendant-arrays(({"a": [1, 2]}, [[3, 4]]))
=> [1, 2], [3, 4], [3, 4]
```

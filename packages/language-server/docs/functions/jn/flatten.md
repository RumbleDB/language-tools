---
name: "flatten"
prefix: "jn"
summary: "Recursively flattens arrays in the input sequence."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
      returnType: "item*"
---

## Rules

Recursively flattens all arrays found in the input sequence `$sequence`, leaving non-array items intact.

## Examples

```jsoniq
jn:flatten(([1, 2], 3, [[4, 5]]))
=> 1, 2, 3, 4, 5
```

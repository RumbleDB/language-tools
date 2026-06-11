---
name: "intersect"
prefix: "jn"
summary: "Returns the intersection of a sequence of objects."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
      returnType: "js:object"
---

## Rules

Returns a single object containing only the keys that are present in all objects of the input sequence `$sequence`. Values of colliding keys are aggregated into an array.

## Examples

```jsoniq
jn:intersect(({"a": 1, "b": 2}, {"b": 3, "c": 4}))
=> {"b": [2, 3]}
```

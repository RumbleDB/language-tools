---
name: "accumulate"
prefix: "jn"
summary: "Merges objects and aggregates colliding keys into arrays."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
      returnType: "js:object"
---

## Rules

Dynamically creates a single object that merges the key-value pairs of all input objects in `$sequence`. If a key is present in multiple objects, their values are accumulated into an array.

## Examples

```jsoniq
jn:accumulate(({ "b" : 2 }, { "c" : 3 }, { "b" : 1 }))
=> { "b": [2, 1], "c": 3 }
```

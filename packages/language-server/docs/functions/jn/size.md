---
name: "size"
prefix: "jn"
summary: "Returns the size of a JSON array."
signatures:
    - params:
          - name: "array"
            type: "js:array?"
      returnType: "xs:integer?"
---

## Rules

Returns the number of elements in the JSON array `$array`. Returns empty sequence if `$array` is empty.

## Examples

```jsoniq
jn:size([1, 2, 3])
=> 3
```

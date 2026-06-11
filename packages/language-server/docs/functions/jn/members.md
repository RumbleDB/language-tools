---
name: "members"
prefix: "jn"
summary: "Returns the members of the JSON array(s)."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
      returnType: "item*"
---

## Rules

Returns the member items of all array items in `$sequence`. Non-array items are ignored.

## Examples

```jsoniq
jn:members(([1, 2], [3]))
=> 1, 2, 3
```

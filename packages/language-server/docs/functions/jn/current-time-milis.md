---
name: "current-time-milis"
prefix: "jn"
summary: "Returns the current system epoch time in milliseconds."
signatures:
    - params: []
      returnType: "xs:integer"
---

## Rules

Returns the current Unix epoch time in milliseconds as an integer.

## Examples

```jsoniq
jn:current-time-milis()
=> 1781258400000
```

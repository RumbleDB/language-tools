---
name: "random"
prefix: "fn"
summary: "Generates one or more pseudo-random numbers."
signatures:
    - params: []
      returnType: "xs:double"
    - params:
          - name: "count"
            type: "xs:integer"
      returnType: "item*"
---

## Rules

If called with no arguments, returns a pseudo-random double value between 0.0 (inclusive) and 1.0 (exclusive). If called with an integer `$count`, returns a sequence of `$count` random doubles.

## Examples

```jsoniq
fn:random()
=> 0.35789

fn:random(3)
=> 0.12, 0.56, 0.98
```

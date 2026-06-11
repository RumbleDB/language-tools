---
name: "random-between"
prefix: "fn"
summary: "Generates a sequence of random numbers between a lower and an upper bound."
signatures:
    - params:
          - name: "lower"
            type: "xs:double"
          - name: "upper"
            type: "xs:double"
          - name: "count"
            type: "xs:integer"
          - name: "type"
            type: "xs:string"
      returnType: "item*"
    - params:
          - name: "lower"
            type: "xs:integer"
          - name: "upper"
            type: "xs:integer"
          - name: "count"
            type: "xs:integer"
          - name: "type"
            type: "xs:string"
          - name: "seed"
            type: "xs:integer"
      returnType: "item*"
---

## Rules

Generates a sequence of random numbers between a lower bound (`$lower`, inclusive) and an upper bound (`$upper`, exclusive).

The `$count` parameter specifies the number of random values to generate, and `$type` specifies the numeric type of generated values (e.g. `"integer"` or `"double"`).

The second signature additionally accepts a `$seed` value for the pseudo-random number generator.

## Examples

```jsoniq
fn:random-between(1, 10, 5, "integer", 42)
=> 3, 7, 2, 9, 5
```

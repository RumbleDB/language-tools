---
name: "seeded_random"
prefix: "fn"
summary: "Generates a sequence of random numbers using a seed."
signatures:
    - params:
          - name: "seed"
            type: "xs:integer"
          - name: "count"
            type: "xs:integer"
      returnType: "item*"
---

## Rules

Generates a sequence of random double values. `$seed` is the seed value for the pseudo-random number generator, and `$count` is the number of elements to generate.

## Examples

```jsoniq
fn:seeded_random(42, 3)
=> 0.158, 0.485, 0.812
```

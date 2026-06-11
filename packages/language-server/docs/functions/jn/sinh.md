---
name: "sinh"
prefix: "jn"
summary: "Returns the hyperbolic sine of a number."
signatures:
    - params:
          - name: "value"
            type: "xs:double?"
      returnType: "xs:double?"
---

## Rules

Returns the hyperbolic sine of the input double `$value`. Returns empty sequence if `$value` is empty.

## Examples

```jsoniq
jn:sinh(0.0)
=> 0.0
```

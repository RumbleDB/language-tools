---
name: "cosh"
prefix: "jn"
summary: "Returns the hyperbolic cosine of a number."
signatures:
    - params:
          - name: "value"
            type: "xs:double?"
      returnType: "xs:double?"
---

## Rules

Returns the hyperbolic cosine of the input double `$value`. Returns empty sequence if `$value` is empty.

## Examples

```jsoniq
jn:cosh(0.0)
=> 1.0
```

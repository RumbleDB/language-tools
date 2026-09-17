---
name: "tanh"
prefix: "jn"
summary: "Returns the hyperbolic tangent of a number."
signatures:
    - params:
          - name: "value"
            type: "xs:double?"
      returnType: "xs:double?"
---

## Rules

Returns the hyperbolic tangent of the input double `$value`. Returns empty sequence if `$value` is empty.

## Examples

```jsoniq
jn:tanh(0.0)
=> 0.0
```

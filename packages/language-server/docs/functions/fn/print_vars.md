---
name: "print_vars"
prefix: "fn"
summary: "Prints variable values to standard output for debugging."
signatures:
    - params:
          - name: "items"
            type: "item*"
      returnType: "js:null?"
---

## Rules

Utility function that prints the values of the variables in `$items` to standard output. It returns `null`.

## Examples

```jsoniq
fn:print_vars($my-variable)
=> null
```

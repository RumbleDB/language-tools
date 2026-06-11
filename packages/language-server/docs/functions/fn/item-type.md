---
name: "item-type"
prefix: "fn"
summary: "Returns the type of the given sequence item(s)."
signatures:
    - params:
          - name: "item"
            type: "item*"
      returnType: "xs:string"
---

## Rules

Returns a string representation of the dynamic item type of the items in `$item`.

## Examples

```jsoniq
fn:item-type((1, 2))
=> "integer"
```

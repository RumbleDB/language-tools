---
name: "delta-file"
prefix: "jn"
summary: "Parses a Delta Lake directory or file."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
---

## Rules

Parses Delta Lake tables from the specified directory path `$path` and returns a sequence of objects.

## Examples

```jsoniq
jn:delta-file("path/to/delta-table")
```

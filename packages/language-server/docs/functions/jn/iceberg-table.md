---
name: "iceberg-table"
prefix: "jn"
summary: "Parses an Apache Iceberg table."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
---

## Rules

Reads an Apache Iceberg table from path `$path` and returns its rows as a sequence of objects.

## Examples

```jsoniq
jn:iceberg-table("path/to/iceberg")
```

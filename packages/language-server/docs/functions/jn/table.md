---
name: "table"
prefix: "jn"
summary: "Parses a Hive-registered Delta table."
signatures:
    - params:
          - name: "tableName"
            type: "xs:string"
      returnType: "item*"
---

## Rules

Reads from a Hive-registered Delta table named `$tableName` and returns its rows as a sequence of objects.

## Examples

```jsoniq
jn:table("delta_table")
```

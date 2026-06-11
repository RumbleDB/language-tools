---
name: "parquet-file"
prefix: "jn"
summary: "Parses one or more Parquet files."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
    - params:
          - name: "path"
            type: "xs:string"
          - name: "partitions"
            type: "xs:integer"
      returnType: "item*"
---

## Rules

Reads Parquet files from path `$path` and returns a sequence of objects. Optional `$partitions` specifies the partition count.

## Examples

```jsoniq
jn:parquet-file("data.parquet")
```

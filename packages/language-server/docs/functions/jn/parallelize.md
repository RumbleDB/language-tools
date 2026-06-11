---
name: "parallelize"
prefix: "jn"
summary: "Parallelizes a sequence of items into a Spark RDD."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
      returnType: "item*"
    - params:
          - name: "sequence"
            type: "item*"
          - name: "partitions"
            type: "xs:integer"
      returnType: "item*"
---

## Rules

Distributes a local sequence of items (`$sequence`) across Spark partitions. Optional `$partitions` specifies partition count.

## Examples

```jsoniq
jn:parallelize(1 to 10000, 4)
```

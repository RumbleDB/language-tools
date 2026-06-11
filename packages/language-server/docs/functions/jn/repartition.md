---
name: "repartition"
prefix: "jn"
summary: "Repartitions a sequence of items across Spark partitions."
signatures:
    - params:
          - name: "sequence"
            type: "item*"
          - name: "partitions"
            type: "xs:integer"
      returnType: "item*"
---

## Rules

Changes the number of Spark partitions for the input sequence `$sequence` to `$partitions`. Useful for optimizing distributed execution.

## Examples

```jsoniq
jn:repartition(json-lines("data.json"), 20)
```

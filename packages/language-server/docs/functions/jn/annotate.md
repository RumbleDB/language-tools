---
name: "annotate"
prefix: "jn"
summary: "Validates and type-annotates a sequence of objects against a schema."
signatures:
    - params:
          - name: "sequence"
            type: "js:object*"
          - name: "schema"
            type: "js:object"
      returnType: "js:object*"
---

## Rules

Validates and annotates the input objects `$sequence` with the schema specified in `$schema`. Essential for SparkML DataFrame algorithms that require structured input schema.

## Examples

```jsoniq
jn:annotate($data, {"id": "integer", "label": "integer"})
```

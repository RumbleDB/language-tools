---
name: "avro-file"
prefix: "jn"
summary: "Parses one or more Avro files."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
    - params:
          - name: "path"
            type: "xs:string"
          - name: "options"
            type: "js:object"
      returnType: "item*"
---

## Rules

Reads Avro files from path `$path`. Optional `$options` provides Spark AVRO options as a JSON object.

## Examples

```jsoniq
jn:avro-file("file.avro")
```

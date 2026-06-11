---
name: "csv-file"
prefix: "jn"
summary: "Parses one or more CSV files."
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

Reads CSV files from path `$path`. Optional `$options` specifies options (such as `header`, `inferSchema`, `delimiter`) as a JSON object.

## Examples

```jsoniq
jn:csv-file("data.csv", {"header": true, "inferSchema": true})
```

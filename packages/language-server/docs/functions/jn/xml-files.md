---
name: "xml-files"
prefix: "jn"
summary: "Parses multiple XML files."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
    - params:
          - name: "path"
            type: "xs:string"
          - name: "partitions"
            type: "xs:integer?"
      returnType: "item*"
---

## Rules

Reads multiple XML files matching path `$path` into an RDD. Optional `$partitions` specifies partitions count.

## Examples

```jsoniq
jn:xml-files("*.xml")
```

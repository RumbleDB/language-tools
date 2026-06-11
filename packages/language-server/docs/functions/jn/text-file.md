---
name: "text-file"
prefix: "jn"
summary: "Parses one or more text files into a sequence of strings."
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

Reads text files from path `$path` and returns a sequence of strings (one per line). Optional `$partitions` specifies partition count.

## Examples

```jsoniq
jn:text-file("file.txt")
```

---
name: "local-text-file"
prefix: "jn"
summary: "Reads a text file locally line by line."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "xs:string*"
---

## Rules

Streams through a local text file at `$path` without Spark parallelism, returning a sequence of strings (one per line).

## Examples

```jsoniq
jn:local-text-file("file.txt")
```

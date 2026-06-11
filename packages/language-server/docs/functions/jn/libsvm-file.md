---
name: "libsvm-file"
prefix: "jn"
summary: "Parses one or more libSVM formatted files."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
---

## Rules

Parses libSVM files from path `$path` and returns a sequence of objects representing the dataset features and labels.

## Examples

```jsoniq
jn:libsvm-file("data.txt")
```

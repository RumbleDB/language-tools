---
name: "root-file"
prefix: "jn"
summary: "Parses a ROOT format file."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
    - params:
          - name: "path"
            type: "xs:string"
          - name: "tree"
            type: "xs:string"
      returnType: "item*"
---

## Rules

Parses a ROOT format file at `$path`. `$tree` specifies the path within the ROOT file structure (e.g., `"Events"`).

## Examples

```jsoniq
jn:root-file("events.root", "Events")
```

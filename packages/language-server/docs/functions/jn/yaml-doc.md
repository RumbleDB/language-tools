---
name: "yaml-doc"
prefix: "jn"
summary: "Parses a YAML file."
signatures:
    - params:
          - name: "path"
            type: "xs:string"
      returnType: "item*"
---

## Rules

Reads and parses a YAML file from path `$path`, converting its contents into JSONiq objects, arrays, and atomic values.

## Examples

```jsoniq
jn:yaml-doc("config.yaml")
```

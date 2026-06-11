---
name: "get-transformer"
prefix: "jn"
summary: "Fetches a SparkML transformer function item."
signatures:
    - params:
          - name: "name"
            type: "xs:string"
      returnType: "function(js:object*, js:object) as js:object*"
    - params:
          - name: "name"
            type: "xs:string"
          - name: "parameters"
            type: "js:object"
      returnType: "function(js:object*, js:object) as js:object*"
---

## Rules

Fetches a machine learning transformer by name (`$name`). Parameters can be configured using `$parameters`. Returns a function that maps a dataset to another dataset.

## Examples

```jsoniq
let $trans := jn:get-transformer("Tokenizer")
```

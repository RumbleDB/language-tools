---
name: "get-estimator"
prefix: "jn"
summary: "Fetches a SparkML estimator function item."
signatures:
    - params:
          - name: "name"
            type: "xs:string"
      returnType: "function(js:object*, js:object) as function(js:object*, js:object) as js:object*"
    - params:
          - name: "name"
            type: "xs:string"
          - name: "parameters"
            type: "js:object"
      returnType: "function(js:object*, js:object) as function(js:object*, js:object) as js:object*"
---

## Rules

Fetches a machine learning estimator by name (`$name`). Parameters can be configured using `$parameters`. Returns a function that trains a model when called with a dataset.

## Examples

```jsoniq
let $est := jn:get-estimator("KMeans")
```

---
name: "mongodb-collection"
prefix: "jn"
summary: "Reads a collection from a MongoDB database."
signatures:
    - params:
          - name: "connectionString"
            type: "xs:string"
          - name: "collection"
            type: "xs:string"
      returnType: "js:object*"
    - params:
          - name: "connectionString"
            type: "xs:string"
          - name: "collection"
            type: "xs:string"
          - name: "partitions"
            type: "xs:integer"
      returnType: "js:object*"
---

## Rules

Connects to a MongoDB database using connection string `$connectionString` and reads collection `$collection`. Optional `$partitions` specifies partition count.

## Examples

```jsoniq
jn:mongodb-collection("mongodb://localhost:27017/db", "mycollection")
```

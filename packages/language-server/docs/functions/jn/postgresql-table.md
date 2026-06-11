---
name: "postgresql-table"
prefix: "jn"
summary: "Connects to PostgreSQL database and retrieves a table."
signatures:
    - params:
          - name: "connectionString"
            type: "xs:string"
          - name: "table"
            type: "xs:string"
      returnType: "js:object*"
    - params:
          - name: "connectionString"
            type: "xs:string"
          - name: "table"
            type: "xs:string"
          - name: "partitions"
            type: "xs:integer"
      returnType: "js:object*"
---

## Rules

Connects to PostgreSQL using connection URL `$connectionString` and reads the table `$table`. Optional `$partitions` specifies partitions count.

## Examples

```jsoniq
jn:postgresql-table("jdbc:postgresql://localhost/db", "users")
```

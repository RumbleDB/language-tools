---
name: "binary-classification-metrics"
prefix: "jn"
summary: "Calculates performance metrics for binary classification."
signatures:
    - params:
          - name: "predictions"
            type: "js:object*"
          - name: "scoreCol"
            type: "xs:string"
          - name: "labelCol"
            type: "xs:string"
      returnType: "item*"
    - params:
          - name: "predictions"
            type: "js:object*"
          - name: "scoreCol"
            type: "xs:string"
          - name: "labelCol"
            type: "xs:string"
          - name: "bins"
            type: "xs:integer"
      returnType: "item*"
---

## Rules

Calculates areaUnderPR, areaUnderROC, ROC curve, and Precision-Recall curve from scores/labels. `$predictions` is the dataset, `$scoreCol` is the score column key, `$labelCol` is the label column key, and `$bins` is the optional number of bins.

## Examples

```jsoniq
jn:binary-classification-metrics($predictions, "score", "label")
```

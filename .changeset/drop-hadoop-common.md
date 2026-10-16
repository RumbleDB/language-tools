---
"rumble-lsp-wrapper": patch
---

fix: resolve the same library versions as RumbleDB by dropping the `hadoop-common` 3.3.6 dependency, which downgraded Gson, Guava, protobuf, Avro and others (e.g. `json-to-xml` failed with `NoClassDefFoundError`)

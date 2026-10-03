---
"rumble-lsp-wrapper": minor
---

refactor(RunQuery): replace Rumble instance with lazy initialization using `createSequence` method

Avoid starting Spark for local queries by using RumbleDB’s compilation and execution pipeline directly. Distributed queries still initialize Spark when needed. This reduce Java process memory usage when running queries.

In a local benchmark using `1 + 1`, process memory after the first result decreased from approximately 401 MiB to 217 MiB, and first-query time decreased from 2.5 seconds to 0.6 seconds. Improvements vary by query and environment; complete query results are still collected in memory.

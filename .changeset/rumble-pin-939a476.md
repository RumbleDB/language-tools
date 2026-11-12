---
"rumble-lsp-wrapper": patch
---

Upgrade RumbleDB to https://github.com/RumbleDB/rumble/commit/939a4769f2e20fb54a7c576a9fa11c08df2ea8e6. The variables of `typeswitch` cases get the type of their case again ([RumbleDB/rumble#2100](https://github.com/RumbleDB/rumble/pull/2100)), and a query that reads a Parquet file or Delta table whose schema cannot be read is still typed, with the type of that data left unknown ([RumbleDB/rumble#2101](https://github.com/RumbleDB/rumble/pull/2101)).

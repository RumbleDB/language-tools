---
"jsoniq-language-server": minor
---

Sync grammar change from RumbleDB

See https://github.com/RumbleDB/rumble/pull/1802 and https://github.com/RumbleDB/rumble/pull/1801

Some parser code had to be updated, like `catchErrorTarget` being renamed to `nameTest`. The formatter code was also updated to reflect this change.

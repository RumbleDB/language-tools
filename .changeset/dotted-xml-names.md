---
"jsoniq-language-server": patch
---

Sync grammar change from RumbleDB

See https://github.com/RumbleDB/rumble/pull/1947, https://github.com/RumbleDB/rumble/pull/1961 and https://github.com/RumbleDB/rumble/pull/1962

JSONiq direct constructors now accept dotted tag and attribute names, such as `<a.b x.y="1"/>`, and the formatter reads them from the new `directConstructorQName` rule.

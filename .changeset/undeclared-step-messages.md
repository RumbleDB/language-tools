---
"jsoniq-language-server": patch
---

fix: upgrade RumbleDB to https://github.com/RumbleDB/rumble/commit/856756f9b31c8773f1d174d26325039006bc8402 so that a path step the XML Schema does not declare is reported with the names it does declare (e.g. `The schema declares no child element o:prices for schema-element(o:order). It declares o:price.`) instead of a generic empty-sequence error

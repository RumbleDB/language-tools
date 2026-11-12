---
"jsoniq-language-server": patch
---

Fix completion that stopped working in XQuery files after completing in a JSONiq file, or the other way around, until the window was reloaded. The release build now keeps class names when it minifies: the JSONiq and XQuery parsers got the same name, and the completion library caches its grammar data by that name.

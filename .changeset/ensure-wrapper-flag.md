---
"jsoniq-language-server": minor
---

Add `--ensure-wrapper` to the server, which downloads the RumbleDB wrapper JAR unless it is cached, prints the command that starts it, and exits. Run it to download the JAR ahead of time, for example when building an image: `node dist/bundled/main.mjs --ensure-wrapper`. It replaces the `dist/integrations/rumble/executable/ensure-wrapper.mjs` script.

import { defineConfig } from "tsdown";

import configs from "./tsdown.config.ts";

// Class names are kept because antlr4-c3 caches follow sets by `parser.constructor.name`:
// the minifier gives the JSONiq and XQuery parsers the same name, and completion then
// breaks in whichever language is completed second.
export default defineConfig(
    configs.map((config) => ({
        ...config,
        sourcemap: false,
        minify: { mangle: { keepNames: { function: false, class: true } } },
    })),
);

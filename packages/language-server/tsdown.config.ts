import { defineConfig } from "tsdown";

export default defineConfig([
    {
        entry: [
            "src/main.ts",
            "src/notifications/index.ts",
            "src/wrapper/executable/ensure-wrapper.ts",
        ],
        root: "src",
        outDir: "dist",

        format: "esm",
        platform: "node",

        dts: true,
        sourcemap: true,
        clean: true,
        minify: false,
    },
    {
        /// Create a bundled build of the language server, which inlines all dependencies.
        /// Useful for VSCode extension, which expects all dependencies to be bundled in the extension package.
        entry: "src/main.ts",
        root: "src",
        outDir: "dist/bundled",

        format: "esm",
        platform: "node",

        dts: true,
        sourcemap: true,
        clean: true,
        minify: false,

        deps: {
            alwaysBundle: [
                "antlr-ng",
                "antlr4-c3",
                "antlr4ng",
                "vscode-languageserver",
                "vscode-languageserver/node",
                "vscode-languageserver-textdocument",
            ],
        },
    },
]);

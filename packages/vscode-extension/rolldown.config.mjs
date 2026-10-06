import { defineConfig } from "rolldown";

import { thirdPartyNotices } from "../../scripts/build/third-party-notices.mjs";

export default defineConfig({
    input: "./src/extension.ts",
    output: {
        file: "./dist/extension.js",
        format: "esm",
        sourcemap: process.env.BUILD !== "production",
        minify: process.env.BUILD === "production",
    },
    external: ["vscode"],
    platform: "node",
    treeshake: true,
    plugins: [thirdPartyNotices()],
});

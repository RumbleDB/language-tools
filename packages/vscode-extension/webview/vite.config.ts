import path from "path";

import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

import { thirdPartyNotices } from "../../../scripts/build/third-party-notices.mjs";

export default defineConfig({
    plugins: [
        solidPlugin(),
        UnoCSS(),
        // UnoCSS inlines the icon data into the CSS, so it is not a bundled module.
        // Iconify's icon packages do not ship the icon set's licence file.
        thirdPartyNotices({
            extraPackages: ["@iconify-json/iconoir"],
            licenseFiles: {
                "@iconify-json/iconoir": path.resolve(
                    import.meta.dirname,
                    "licenses/iconoir-LICENSE",
                ),
            },
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
            "@shared": path.resolve(import.meta.dirname, "../src/shared"),
        },
    },
    build: {
        outDir: path.resolve(import.meta.dirname, "../dist/webview"),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: "index.js",
                assetFileNames: "index.[ext]",
            },
        },
    },
});

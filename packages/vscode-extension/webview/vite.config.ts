import path from "path";

import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
    plugins: [solidPlugin(), UnoCSS()],
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

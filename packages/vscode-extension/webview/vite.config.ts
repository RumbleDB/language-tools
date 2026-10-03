import path from "path";

import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
    plugins: [solidPlugin(), UnoCSS()],
    build: {
        outDir: path.resolve(__dirname, "../dist/webview"),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: "index.js",
                assetFileNames: "index.[ext]",
            },
        },
    },
});

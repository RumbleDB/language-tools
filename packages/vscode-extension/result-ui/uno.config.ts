import { defineConfig, presetIcons, presetWind4 } from "unocss";

export default defineConfig({
    presets: [
        presetWind4({
            preflights: {
                reset: true,
            },
        }),
        presetIcons({
            scale: 1.2,
            extraProperties: {
                display: "inline-block",
                "vertical-align": "middle",
            },
        }),
    ],
    theme: {
        colors: {
            surface: "var(--vscode-editor-background, #f7f9fb)",
            "on-surface": "var(--vscode-editor-foreground, #191c1e)",
            "surface-container": "var(--vscode-editorWidget-background, #eceef0)",
            "surface-container-low": "var(--vscode-sideBar-background, #f2f4f6)",
            "surface-container-lowest": "var(--vscode-editor-background, #ffffff)",
            "surface-container-high": "var(--vscode-sideBarSectionHeader-background, #f1f5f9)",
            "surface-variant": "var(--vscode-list-hoverBackground, rgba(0, 0, 0, 0.04))",
            outline: "#737686",
            "outline-variant": "var(--vscode-panel-border, #c3c6d7)",
            primary: "var(--vscode-button-background, #004ac6)",
            secondary: "var(--vscode-descriptionForeground, #515f74)",
            error: "#ba1a1a",
        },
        fontFamily: {
            inter: ["Inter", "sans-serif"],
            code: ["JetBrains Mono", "monospace"],
        },
    },
});

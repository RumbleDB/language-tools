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
        fontSize: {
            "2xs": ["11px", "14px"],
        },
        colors: {
            surface: "var(--vscode-editor-background)",
            "on-surface": "var(--vscode-editor-foreground)",
            "surface-container":
                "var(--vscode-editorWidget-background, var(--vscode-sideBar-background))",
            "surface-container-low":
                "var(--vscode-sideBar-background, var(--vscode-editorWidget-background))",
            "surface-container-lowest": "var(--vscode-editor-background)",
            "surface-container-high":
                "var(--vscode-editorWidget-background, var(--vscode-editor-background))",
            "surface-variant": "var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.12))",
            outline: "var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.6))",
            "outline-variant":
                "var(--vscode-panel-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.35)))",
            primary: "var(--vscode-button-background)",
            "on-primary": "var(--vscode-button-foreground)",
            secondary: "var(--vscode-descriptionForeground)",
            error: "var(--vscode-errorForeground, #f48771)",
            "error-container":
                "var(--vscode-inputValidation-errorBackground, rgba(90, 29, 29, 0.4))",
            "on-error-container": "var(--vscode-errorForeground, #f48771)",
            success: "var(--vscode-testing-iconPassed, #2ecc71)",
            "token-number":
                "var(--vscode-symbolIcon-numberForeground, var(--vscode-editor-foreground))",
            "token-string":
                "var(--vscode-symbolIcon-stringForeground, var(--vscode-editor-foreground))",
            "input-bg": "var(--vscode-input-background, var(--vscode-editor-background))",
            "input-placeholder":
                "var(--vscode-input-placeholderForeground, rgba(204, 204, 204, 0.5))",
        },
        fontFamily: {
            inter: ["var(--vscode-font-family)", "Inter", "sans-serif"],
            code: ["var(--vscode-editor-font-family)", "JetBrains Mono", "monospace"],
        },
    },
});

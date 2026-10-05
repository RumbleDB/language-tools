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
            "badge-bg":
                "var(--vscode-textCodeBlock-background, color-mix(in srgb, var(--vscode-editor-foreground) 8%, var(--vscode-editor-background)))",
            "badge-fg": "var(--vscode-descriptionForeground, var(--vscode-editor-foreground))",
            surface: "var(--vscode-editor-background)",
            "on-surface": "var(--vscode-foreground, var(--vscode-editor-foreground))",
            "surface-container":
                "var(--vscode-editorWidget-background, var(--vscode-editor-background))",
            "on-container": "var(--vscode-editorWidget-foreground, var(--vscode-foreground))",
            "row-hover": "var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08))",
            "action-hover": "var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.12))",
            "outline-variant":
                "var(--vscode-contrastBorder, var(--vscode-panel-border, var(--vscode-widget-border, transparent)))",
            "row-divider":
                "var(--vscode-contrastBorder, color-mix(in srgb, var(--vscode-panel-border, var(--vscode-widget-border, transparent)) 30%, transparent))",
            focus: "var(--vscode-focusBorder)",
            primary: "var(--vscode-button-background)",
            "primary-hover":
                "var(--vscode-button-hoverBackground, var(--vscode-button-background))",
            "on-primary": "var(--vscode-button-foreground)",
            secondary: "var(--vscode-descriptionForeground, var(--vscode-foreground))",
            error: "var(--vscode-errorForeground, var(--vscode-foreground))",
            success: "var(--vscode-testing-iconPassed, var(--vscode-foreground))",
            link: "var(--vscode-textLink-foreground, var(--vscode-foreground))",
            "link-hover":
                "var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground))",
            resize: "var(--vscode-sash-hoverBorder, var(--vscode-focusBorder))",
            "input-bg": "var(--vscode-input-background, var(--vscode-editor-background))",
            "input-fg": "var(--vscode-input-foreground, var(--vscode-foreground))",
            "input-border": "var(--vscode-input-border, var(--vscode-contrastBorder, transparent))",
            "input-placeholder":
                "var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground))",
            "dropdown-bg": "var(--vscode-dropdown-background, var(--vscode-input-background))",
            "dropdown-fg": "var(--vscode-dropdown-foreground, var(--vscode-input-foreground))",
            "dropdown-border":
                "var(--vscode-dropdown-border, var(--vscode-contrastBorder, transparent))",
            "dropdown-list":
                "var(--vscode-dropdown-listBackground, var(--vscode-dropdown-background))",
        },
        fontFamily: {
            sans: [
                "var(--vscode-font-family)",
                "Inter",
                "-apple-system",
                "BlinkMacSystemFont",
                "Segoe UI",
                "sans-serif",
            ],
            mono: ["var(--vscode-editor-font-family)", "JetBrains Mono", "monospace"],
        },
    },
});

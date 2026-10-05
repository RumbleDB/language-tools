import { createHighlighterCore } from "shiki/core";
import type { LanguageRegistration } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import xml from "shiki/langs/xml.mjs";

import xquery from "../../../syntaxes/xquery.tmLanguage.json" with { type: "json" };

export type SourceLanguage = "xml" | "xquery";

export interface SourceToken {
    content: string;
    color?: string;
}

const foreground = "var(--vscode-editor-foreground)";
const highlighter = createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: [xml, { ...xquery, name: "xquery" } as unknown as LanguageRegistration],
    themes: [
        {
            name: "webview",
            fg: foreground,
            bg: "var(--vscode-editor-background)",
            settings: [
                {
                    scope: "comment",
                    settings: { foreground: `var(--vscode-descriptionForeground, ${foreground})` },
                },
                {
                    scope: [
                        "entity.name.tag",
                        "entity.name.function",
                        "support.function",
                        "storage.type",
                        "entity.name.type",
                    ],
                    settings: {
                        foreground: `var(--vscode-debugTokenExpression-name, ${foreground})`,
                    },
                },
                {
                    scope: ["entity.other.attribute-name", "constant.numeric"],
                    settings: {
                        foreground: `var(--vscode-debugTokenExpression-number, ${foreground})`,
                    },
                },
                {
                    scope: "string",
                    settings: {
                        foreground: `var(--vscode-debugTokenExpression-string, ${foreground})`,
                    },
                },
                {
                    scope: ["constant.character.entity", "constant.language", "keyword"],
                    settings: {
                        foreground: `var(--vscode-debugTokenExpression-boolean, ${foreground})`,
                    },
                },
            ],
        },
    ],
});

const previews = new Map<string, SourceToken[]>();
const CACHE_ENTRIES = 64;
const CACHE_SOURCE_LIMIT = 1000;

/** Color source without changing whitespace or interpreting the serialization as markup. */
export async function highlightSource(
    source: string,
    language: SourceLanguage = "xquery",
): Promise<SourceToken[]> {
    // Very large serializations remain readable without blocking the results panel.
    if (source.length > 100_000) return [{ content: source }];
    const key = `${language}\0${source}`;
    const cached = previews.get(key);
    if (cached) {
        previews.delete(key);
        previews.set(key, cached);
        return cached;
    }
    const instance = await highlighter;
    const lines = instance.codeToTokensBase(source, { lang: language, theme: "webview" });
    const tokens: SourceToken[] = [];
    let offset = 0;
    for (const line of lines) {
        for (const token of line) {
            if (token.offset > offset) {
                tokens.push({ content: source.slice(offset, token.offset) });
            }
            tokens.push({ content: token.content, color: token.color });
            offset = token.offset + token.content.length;
        }
    }
    if (offset < source.length) tokens.push({ content: source.slice(offset) });
    if (source.length <= CACHE_SOURCE_LIMIT) {
        previews.set(key, tokens);
        if (previews.size > CACHE_ENTRIES) previews.delete(previews.keys().next().value!);
    }
    return tokens;
}

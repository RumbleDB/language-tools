import { createResource, For, Show } from "solid-js";

import type { SourceLanguage, SourceToken } from "@/utils/syntax-highlight.js";

/** Inline tokens share highlighting between summaries and expanded source. */
export function SourceTokens(props: { source: string; language?: SourceLanguage }) {
    const [highlighted] = createResource(
        () => ({ source: props.source, language: props.language ?? "xquery" }),
        async ({ source, language }) => {
            try {
                const { highlightSource } = await import("@/utils/syntax-highlight.js");
                return { source, language, tokens: await highlightSource(source, language) };
            } catch {
                return { source, language, tokens: [{ content: source }] as SourceToken[] };
            }
        },
    );
    const tokens = () => {
        const result = highlighted();
        return result?.source === props.source && result.language === (props.language ?? "xquery")
            ? result.tokens
            : undefined;
    };
    return (
        <Show when={tokens()} fallback={props.source}>
            {(value) => (
                <For each={value()}>
                    {(token) => <span style={{ color: token.color }}>{token.content}</span>}
                </For>
            )}
        </Show>
    );
}

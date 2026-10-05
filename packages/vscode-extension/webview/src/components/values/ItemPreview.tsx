import { For, Show } from "solid-js";

import type { PreviewPart } from "@/utils/item-presentation.js";

import { SourceTokens } from "./SourceTokens.js";

export function ItemPreview(props: { parts: PreviewPart[] }) {
    return (
        <For each={props.parts}>
            {(part) => (
                <span class={`result-value-${part.tone ?? "value"}`} title={part.title}>
                    <Show when={part.language} fallback={part.content}>
                        <SourceTokens source={part.content} language={part.language} />
                    </Show>
                </span>
            )}
        </For>
    );
}

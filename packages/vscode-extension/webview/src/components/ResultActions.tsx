import { createSignal, Show } from "solid-js";

import type { RunQueryItem } from "@/types.js";
import { serializeResultItems } from "@/utils/result-items.js";
import { vscode } from "@/vscode.js";

export function ResultActions(props: { items: RunQueryItem[] }) {
    const [error, setError] = createSignal("");
    const disabled = () =>
        props.items.length === 0 || props.items.some((item) => item.serialized === null);

    const openInEditor = () => {
        setError("");
        try {
            vscode.postMessage("OPEN_RAW_OUTPUT", {
                sequence: serializeResultItems(props.items),
            });
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        }
    };

    return (
        <div class="flex items-center gap-2">
            <button
                type="button"
                disabled={disabled()}
                onClick={openInEditor}
                title="Open the raw result sequence in an editor tab"
                class="px-2 py-1 text-xs flex items-center gap-1 rounded hover:bg-surface-variant hover:text-on-surface cursor-pointer disabled:opacity-30"
            >
                <span class="w-3 h-3 shrink-0 i-iconoir-open-new-window" />
                Open in editor
            </button>
            <Show when={error()}>
                <span role="alert" class="text-xs text-error">
                    {error()}
                </span>
            </Show>
        </div>
    );
}

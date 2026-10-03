import type { RunQueryItem } from "@/types.js";
import { formatRawOutput } from "@/utils/result-items.js";
import { vscode } from "@/vscode.js";

export function ResultActions(props: { items: RunQueryItem[] }) {
    const openInEditor = () => {
        vscode.postMessage("OPEN_RAW_OUTPUT", {
            sequence: formatRawOutput(props.items),
        });
    };

    return (
        <div class="flex items-center gap-2">
            <button
                type="button"
                disabled={props.items.length === 0}
                onClick={openInEditor}
                title="Open the raw result sequence in an editor tab"
                class="px-2 py-1 text-xs flex items-center gap-1 rounded hover:bg-action-hover hover:text-on-surface cursor-pointer disabled:opacity-30"
            >
                <span class="w-3 h-3 shrink-0 i-iconoir-open-new-window" />
                Open in editor
            </button>
        </div>
    );
}

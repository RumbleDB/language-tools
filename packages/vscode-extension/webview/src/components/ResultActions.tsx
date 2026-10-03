import { createSignal, Show } from "solid-js";

import type { RunQueryItem } from "@/types.js";
import { createCopyAction } from "@/utils/clipboard.js";
import { formatCsv, serializeResultItems, type ResultTableRow } from "@/utils/result-items.js";
import { vscode } from "@/vscode.js";

export function ResultActions(props: {
    items: RunQueryItem[];
    rows: ResultTableRow[];
    columns: string[];
    tableView: boolean;
}) {
    const { copy, copied } = createCopyAction();
    const [error, setError] = createSignal("");
    const disabled = () =>
        props.items.length === 0 || props.items.some((item) => item.serialized === null);
    const copyRows = async () => {
        setError("");
        try {
            if (!(await copy(serializeResultItems(props.items))))
                setError("Unable to copy to clipboard.");
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        }
    };
    const exportRows = () => {
        setError("");
        try {
            vscode.postMessage("EXPORT_RESULTS", {
                csv: formatCsv(props.rows, props.columns),
                sequence: serializeResultItems(props.items),
            });
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        }
    };
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
        <div class="flex items-center gap-2 flex-wrap">
            <button
                type="button"
                disabled={disabled()}
                onClick={copyRows}
                aria-label={copied() ? "Copied" : "Copy"}
                title={
                    props.tableView
                        ? "Copy all matching rows in sort order, across every page"
                        : "Copy the entire result sequence in its original order"
                }
                class="px-2 py-1 text-xs flex items-center gap-1 rounded hover:bg-surface-variant hover:text-on-surface cursor-pointer disabled:opacity-30"
            >
                <span
                    class={`w-3 h-3 shrink-0 ${copied() ? "i-iconoir-check text-success" : "i-iconoir-copy"}`}
                />
                Copy
            </button>
            <button
                type="button"
                disabled={disabled()}
                onClick={exportRows}
                title={
                    props.tableView
                        ? "Export all matching rows in sort order, across every page"
                        : "Export the entire result sequence in its original order"
                }
                class="px-2 py-1 text-xs flex items-center gap-1 rounded hover:bg-surface-variant hover:text-on-surface cursor-pointer disabled:opacity-30"
            >
                <span class="w-3 h-3 shrink-0 i-iconoir-download" />
                Export
            </button>
            <button
                type="button"
                disabled={disabled()}
                onClick={openInEditor}
                title="Open the raw result sequence as a text document in the editor"
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

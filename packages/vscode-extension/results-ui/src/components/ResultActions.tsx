import { createSignal, Show } from "solid-js";

import type { RunQueryItem } from "../types.js";
import { createCopyAction } from "../utils/clipboard.js";
import { formatCsv, serializeResultItems, type ResultTableRow } from "../utils/result-items.js";
import { vscode } from "../vscode.js";

export function ResultActions(props: {
    items: RunQueryItem[];
    rows: ResultTableRow[];
    columns: string[];
}) {
    const { copy, copied } = createCopyAction();
    const [format, setFormat] = createSignal<"sequence" | "csv">("sequence");
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
            const content =
                format() === "csv"
                    ? formatCsv(props.rows, props.columns)
                    : serializeResultItems(props.items);
            vscode.postMessage({ type: "EXPORT_RESULTS", format: format(), content });
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
                title="Copy all matching rows in sort order, across every page"
                class="px-2 py-1 text-xs flex items-center gap-1 rounded hover:bg-surface-variant cursor-pointer disabled:opacity-30"
            >
                <span class={copied() ? "i-iconoir-check text-success" : "i-iconoir-copy"} />
                {copied()
                    ? "Copied"
                    : `Copy ${props.items.length} row${props.items.length === 1 ? "" : "s"}`}
            </button>
            <select
                aria-label="Export format"
                value={format()}
                onChange={(event) => setFormat(event.currentTarget.value as "sequence" | "csv")}
                class="text-xs bg-surface text-on-surface border border-outline-variant rounded px-1 py-1"
            >
                <option value="sequence">Sequence (.txt)</option>
                <option value="csv">CSV (.csv)</option>
            </select>
            <button
                type="button"
                disabled={disabled()}
                onClick={exportRows}
                title="Export all matching rows in sort order, across every page"
                class="px-2 py-1 text-xs rounded hover:bg-surface-variant cursor-pointer disabled:opacity-30"
            >
                Export {props.items.length} row{props.items.length === 1 ? "" : "s"}
            </button>
            <Show when={error()}>
                <span role="alert" class="text-xs text-error">
                    {error()}
                </span>
            </Show>
        </div>
    );
}

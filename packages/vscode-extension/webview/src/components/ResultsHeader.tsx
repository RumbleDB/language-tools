import { For, Show, type JSX } from "solid-js";

import type { ViewMode } from "@/types.js";
import { formatDuration } from "@/utils/format-duration.js";

interface ResultsHeaderProps {
    isSuccess: boolean;
    hasItems: boolean;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    durationMs: number;
    rowCount: number;
    actions: JSX.Element;
    running: boolean;
    onRerun: () => void;
}

const VIEW_MODES = [
    { mode: "inspect", label: "Inspect", icon: "i-iconoir-list" },
    { mode: "table", label: "Table", icon: "i-iconoir-table" },
] as const;

export function ResultsHeader(props: ResultsHeaderProps) {
    return (
        <header class="bg-surface border-b border-outline-variant min-h-[36px] py-1 px-4 flex items-center justify-between gap-2 flex-wrap w-full shrink-0 z-10 box-border">
            <div class="flex items-center gap-2 text-secondary min-w-0">
                <button
                    type="button"
                    onClick={props.onRerun}
                    disabled={props.running}
                    aria-busy={props.running}
                    title={
                        props.running
                            ? "Query is running"
                            : "Re-run this query file using its current contents"
                    }
                    class="px-2 py-1 text-xs flex items-center gap-1 rounded bg-primary text-on-primary cursor-pointer disabled:opacity-30"
                >
                    <span
                        class="i-iconoir-refresh w-3 h-3 shrink-0"
                        classList={{ "animate-spin": props.running }}
                    />
                    Re-run
                </button>
                <Show when={props.isSuccess}>
                    <div class="w-px h-3.5 bg-outline-variant shrink-0" />
                    <div class="flex items-center gap-2.5 text-secondary shrink-0">
                        <span
                            class="flex items-center gap-1 text-2xs"
                            title={`Query execution time: ${props.durationMs} ms`}
                        >
                            <span class="i-iconoir-timer text-xs" />
                            {formatDuration(props.durationMs)}
                        </span>
                        <span class="flex items-center gap-1 text-2xs">
                            <span class="i-iconoir-table-rows text-xs" />
                            {props.rowCount} item{props.rowCount === 1 ? "" : "s"}
                        </span>
                    </div>
                </Show>
            </div>

            <div class="flex items-center gap-2 shrink-0">
                <Show when={props.isSuccess && props.hasItems}>
                    <div class="flex items-center bg-surface-container rounded p-0.5 border border-outline-variant gap-1">
                        <For each={VIEW_MODES}>
                            {(item) => (
                                <button
                                    onClick={() => props.onViewModeChange(item.mode)}
                                    aria-pressed={props.viewMode === item.mode}
                                    class={`px-2 py-0.5 rounded-sm text-2xs font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                                        props.viewMode === item.mode
                                            ? "bg-primary text-on-primary font-semibold"
                                            : "text-secondary hover:text-on-surface"
                                    }`}
                                >
                                    <span class={`${item.icon} text-xs`} />
                                    {item.label}
                                </button>
                            )}
                        </For>
                    </div>

                    <div class="w-px h-3.5 bg-outline-variant" />

                    {props.actions}
                </Show>
            </div>
        </header>
    );
}

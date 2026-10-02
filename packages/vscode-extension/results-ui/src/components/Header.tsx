import { For, Show } from "solid-js";

import type { ViewMode } from "../types.js";

interface HeaderProps {
    fileName: string;
    isSuccess: boolean;
    hasItems: boolean;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    durationMs: number;
    rowCount: number;
    copied: boolean;
    onCopy: () => void;
}

const VIEW_MODES = [
    { mode: "inspect", label: "Inspect", icon: "i-iconoir-list" },
    { mode: "table", label: "Table", icon: "i-iconoir-table" },
    { mode: "raw", label: "Raw Output", icon: "i-iconoir-code" },
] as const;

export function Header(props: HeaderProps) {
    return (
        <header class="bg-surface border-b border-outline-variant min-h-[36px] py-1 px-4 flex items-center justify-between gap-2 flex-wrap w-full shrink-0 z-10 box-border">
            <div class="flex items-center gap-2 text-secondary min-w-0">
                <span
                    class={
                        props.isSuccess
                            ? "i-iconoir-page text-base shrink-0"
                            : "i-iconoir-alert-triangle text-base shrink-0 text-error"
                    }
                />
                <h1 class="text-sm font-semibold text-on-surface truncate max-w-[240px] sm:max-w-xs">
                    {props.fileName}
                </h1>
                <Show when={!props.isSuccess}>
                    <span class="px-1.5 py-0.2 rounded text-2xs font-medium bg-error/15 text-error border border-error/30 shrink-0">
                        Failed
                    </span>
                </Show>
                <Show when={props.isSuccess}>
                    <div class="w-px h-3.5 bg-outline-variant shrink-0" />
                    <div class="flex items-center gap-2.5 text-secondary shrink-0">
                        <span class="flex items-center gap-1 text-2xs">
                            <span class="i-iconoir-timer text-xs" />
                            {props.durationMs}ms
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

                    <button
                        onClick={props.onCopy}
                        title="Copy the entire result sequence in its original order"
                        class="px-2 py-0.5 text-on-surface hover:bg-surface-variant rounded transition-colors flex items-center gap-1 cursor-pointer font-sans text-2xs"
                    >
                        <span
                            class={
                                props.copied
                                    ? "i-iconoir-check text-xs text-success"
                                    : "i-iconoir-copy text-xs"
                            }
                        />
                        {props.copied ? "Copied" : "Copy all"}
                    </button>
                </Show>
            </div>
        </header>
    );
}

import { For, Show } from "solid-js";

interface HeaderProps {
    fileName: string;
    isSuccess: boolean;
    hasItems: boolean;
    viewMode: "table" | "raw";
    onViewModeChange: (mode: "table" | "raw") => void;
}

const VIEW_MODES = [
    { mode: "table", label: "Table", icon: "i-iconoir-table" },
    { mode: "raw", label: "Raw Output", icon: "i-iconoir-code" },
] as const;

export function Header(props: HeaderProps) {
    return (
        <header class="bg-surface border-b border-outline-variant min-h-[36px] py-1 px-4 flex items-center justify-between gap-2 w-full shrink-0 z-10 box-border">
            <div class="flex items-center gap-2 text-secondary min-w-0">
                <span class="i-iconoir-page text-base shrink-0" />
                <h1 class="text-sm font-semibold text-on-surface truncate max-w-[240px] sm:max-w-xs">
                    {props.fileName}
                </h1>
            </div>

            <div class="flex items-center gap-2 shrink-0">
                <Show when={props.isSuccess && props.hasItems}>
                    <div class="flex items-center bg-surface-container rounded p-0.5 border border-outline-variant gap-1">
                        <For each={VIEW_MODES}>
                            {(item) => (
                                <button
                                    onClick={() => props.onViewModeChange(item.mode)}
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
                </Show>
            </div>
        </header>
    );
}

import { Show } from "solid-js";

interface HeaderProps {
    fileName: string;
    isSuccess: boolean;
    hasItems: boolean;
    viewMode: "table" | "raw";
    onViewModeChange: (mode: "table" | "raw") => void;
}

export function Header(props: HeaderProps) {
    return (
        <header class="bg-surface ui-border-b min-h-[36px] py-1 px-3 flex items-center justify-between gap-2 w-full shrink-0 z-10 box-border">
            <div class="flex items-center gap-2 text-secondary min-w-0">
                <span class="i-lucide-file-text text-[16px] text-primary shrink-0" />
                <h1 class="text-[14px] font-semibold text-on-surface truncate max-w-[240px] sm:max-w-xs">
                    {props.fileName}
                </h1>
                <Show
                    when={props.isSuccess}
                    fallback={
                        <div class="flex items-center gap-1 text-error bg-error-container px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wider border border-error/30 shrink-0">
                            <span class="i-lucide-x-circle text-[13px]" />
                            ERROR
                        </div>
                    }
                >
                    <div class="flex items-center gap-1 text-success bg-success/15 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wider border border-success/30 shrink-0">
                        <span class="i-lucide-check-circle-2 text-[13px]" />
                        SUCCESS
                    </div>
                </Show>
            </div>

            <div class="flex items-center gap-2 shrink-0">
                <Show when={props.isSuccess && props.hasItems}>
                    <div class="flex items-center bg-surface-container rounded p-0.5 border border-outline-variant">
                        <button
                            onClick={() => props.onViewModeChange("table")}
                            class={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                                props.viewMode === "table"
                                    ? "bg-primary text-on-primary font-semibold"
                                    : "text-secondary hover:text-on-surface"
                            }`}
                        >
                            <span class="i-lucide-table-properties text-[13px]" />
                            Table
                        </button>
                        <button
                            onClick={() => props.onViewModeChange("raw")}
                            class={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                                props.viewMode === "raw"
                                    ? "bg-primary text-on-primary font-semibold"
                                    : "text-secondary hover:text-on-surface"
                            }`}
                        >
                            <span class="i-lucide-code-2 text-[13px]" />
                            Raw Output
                        </button>
                    </div>
                </Show>
            </div>
        </header>
    );
}

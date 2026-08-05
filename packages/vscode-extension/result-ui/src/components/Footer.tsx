import type { Table as SolidTable } from "@tanstack/solid-table";

interface FooterProps {
    durationMs: number;
    rowCount: number;
    table: SolidTable<Record<string, unknown>>;
    pageSize: number;
    onPageSizeChange: (size: number) => void;
    copied: boolean;
    onCopy: () => void;
}

export function Footer(props: FooterProps) {
    return (
        <footer class="bg-surface-container-low border-t border-outline-variant min-h-[32px] py-1 px-3 w-full shrink-0 flex items-center justify-between gap-3 text-xs z-10 flex-wrap box-border">
            <div class="flex items-center gap-3 text-secondary shrink-0">
                <span class="flex items-center gap-1">
                    <span class="i-iconoir-timer text-sm" />
                    {props.durationMs}ms
                </span>
                <span class="flex items-center gap-1">
                    <span class="i-iconoir-table-rows text-sm" />
                    Rows: {props.rowCount}
                </span>
            </div>

            <div class="flex items-center gap-3 shrink-0">
                <div class="flex items-center gap-1">
                    <button
                        onClick={() => props.table.previousPage()}
                        disabled={!props.table.getCanPreviousPage()}
                        class="p-1 hover:bg-surface-variant rounded transition-colors disabled:opacity-30 cursor-pointer flex items-center justify-center text-on-surface"
                    >
                        <span class="i-iconoir-chevron-left text-sm" />
                    </button>

                    <span class="px-1 text-xs text-secondary font-medium">
                        Page {props.table.getState().pagination.pageIndex + 1} of{" "}
                        {props.table.getPageCount()}
                    </span>

                    <button
                        onClick={() => props.table.nextPage()}
                        disabled={!props.table.getCanNextPage()}
                        class="p-1 hover:bg-surface-variant rounded transition-colors disabled:opacity-30 cursor-pointer flex items-center justify-center text-on-surface"
                    >
                        <span class="i-iconoir-chevron-right text-sm" />
                    </button>
                </div>

                <div class="w-px h-3.5 bg-outline-variant" />

                <div class="flex items-center gap-1.5 text-secondary">
                    <span class="text-2xs">Show:</span>
                    <select
                        value={props.pageSize}
                        onChange={(e) => {
                            const size = Number(e.currentTarget.value);
                            props.onPageSizeChange(size);
                        }}
                        class="bg-transparent border-none p-0 text-2xs font-medium focus:ring-0 cursor-pointer text-on-surface"
                    >
                        <option value={20} class="bg-surface text-on-surface">
                            20
                        </option>
                        <option value={50} class="bg-surface text-on-surface">
                            50
                        </option>
                        <option value={100} class="bg-surface text-on-surface">
                            100
                        </option>
                        <option value={250} class="bg-surface text-on-surface">
                            250
                        </option>
                    </select>
                </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
                <button
                    onClick={props.onCopy}
                    class="px-2 py-0.5 text-on-surface hover:bg-surface-variant rounded transition-colors flex items-center gap-1 cursor-pointer font-sans"
                >
                    <span
                        class={
                            props.copied
                                ? "i-iconoir-check text-sm text-success"
                                : "i-iconoir-copy text-sm"
                        }
                    />
                    {props.copied ? "Copied" : "Copy Results"}
                </button>
            </div>
        </footer>
    );
}

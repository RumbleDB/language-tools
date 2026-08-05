import { flexRender, type Table as SolidTable } from "@tanstack/solid-table";
import { For, Show } from "solid-js";

interface TableProps {
    table: SolidTable<Record<string, unknown>>;
    globalFilter: string;
    onGlobalFilterChange: (value: string) => void;
    totalRows: number;
}

export function TableView(props: TableProps) {
    return (
        <div class="flex-1 flex flex-col overflow-hidden w-full">
            {/* Toolbar / Search */}
            <div class="px-4 py-2.5 flex items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-lowest shrink-0 flex-wrap">
                <div class="relative w-full max-w-xs sm:max-w-md">
                    <span class="i-iconoir-search absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm" />
                    <input
                        type="text"
                        value={props.globalFilter}
                        onInput={(e) => props.onGlobalFilterChange(e.currentTarget.value)}
                        placeholder="Filter results..."
                        class="w-full pl-9 pr-8 py-1 bg-input-bg border border-outline-variant rounded text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-input-placeholder text-on-surface"
                    />
                    <Show when={props.globalFilter}>
                        <button
                            onClick={() => props.onGlobalFilterChange("")}
                            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface p-0.5 rounded cursor-pointer transition-colors"
                            title="Clear filter"
                        >
                            <span class="i-iconoir-xmark text-xs" />
                        </button>
                    </Show>
                </div>
                <span class="text-xs text-secondary shrink-0">
                    Showing {props.table.getFilteredRowModel().rows.length} of {props.totalRows}{" "}
                    rows
                </span>
            </div>

            {/* Data Table Container with Horizontal & Vertical Overflow */}
            <div class="flex-1 overflow-auto bg-surface-container-lowest p-4">
                <div class="border border-outline-variant rounded bg-surface overflow-auto max-w-full h-full max-h-full">
                    <table class="w-full min-w-full text-left border-separate border-spacing-0 table-fixed">
                        <colgroup>
                            <For each={props.table.getVisibleFlatColumns()}>
                                {(column) => <col style={{ width: `${column.getSize()}px` }} />}
                            </For>
                        </colgroup>
                        <thead class="sticky top-0 z-10">
                            <tr>
                                <For each={props.table.getHeaderGroups()}>
                                    {(headerGroup) => (
                                        <For each={headerGroup.headers}>
                                            {(header) => (
                                                <th
                                                    onClick={header.column.getToggleSortingHandler()}
                                                    style={{ width: `${header.getSize()}px` }}
                                                    class={`sticky top-0 z-20 bg-surface-container-high border-b border-r border-outline-variant px-4 py-2.5 text-2xs font-bold text-on-surface tracking-wider uppercase select-none last:border-r-0 ${
                                                        header.column.getCanSort()
                                                            ? "cursor-pointer hover:bg-surface-variant"
                                                            : ""
                                                    }`}
                                                >
                                                    <div class="flex items-center justify-between gap-1">
                                                        <span>
                                                            {flexRender(
                                                                header.column.columnDef.header,
                                                                header.getContext(),
                                                            )}
                                                        </span>
                                                        <Show when={header.column.getCanSort()}>
                                                            <span class="text-secondary text-xs">
                                                                {header.column.getIsSorted() ===
                                                                "asc" ? (
                                                                    <span class="i-iconoir-arrow-up text-xs text-primary" />
                                                                ) : header.column.getIsSorted() ===
                                                                  "desc" ? (
                                                                    <span class="i-iconoir-arrow-down text-xs text-primary" />
                                                                ) : (
                                                                    <span class="i-iconoir-arrow-up-down text-xs opacity-30" />
                                                                )}
                                                            </span>
                                                        </Show>
                                                    </div>
                                                    <Show when={header.column.getCanResize()}>
                                                        <div
                                                            onMouseDown={header.getResizeHandler()}
                                                            onTouchStart={header.getResizeHandler()}
                                                            onClick={(e) => e.stopPropagation()}
                                                            class={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none hover:bg-primary/50 transition-colors ${
                                                                header.column.getIsResizing()
                                                                    ? "bg-primary w-1 opacity-100"
                                                                    : "opacity-0 hover:opacity-100"
                                                            }`}
                                                        />
                                                    </Show>
                                                </th>
                                            )}
                                        </For>
                                    )}
                                </For>
                            </tr>
                        </thead>
                        <tbody class="font-code text-xs text-on-surface">
                            <For each={props.table.getRowModel().rows}>
                                {(row) => (
                                    <tr class="hover:bg-surface-variant transition-colors">
                                        <For each={row.getVisibleCells()}>
                                            {(cell) => (
                                                <td
                                                    style={{ width: `${cell.column.getSize()}px` }}
                                                    class="border-b border-r border-outline-variant/30 px-4 py-2.5 text-on-surface max-w-[400px] break-words overflow-wrap-anywhere align-top last:border-r-0"
                                                >
                                                    {flexRender(
                                                        cell.column.columnDef.cell,
                                                        cell.getContext(),
                                                    )}
                                                </td>
                                            )}
                                        </For>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

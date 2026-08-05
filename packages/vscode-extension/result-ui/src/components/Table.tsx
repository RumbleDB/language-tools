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
            <div class="px-4 py-2.5 flex items-center justify-between gap-2 border-b ui-border-b bg-surface-container-lowest shrink-0 flex-wrap">
                <div class="relative w-full max-w-xs sm:max-w-md">
                    <span class="i-iconoir-search absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[14px]" />
                    <input
                        type="text"
                        value={props.globalFilter}
                        onInput={(e) => props.onGlobalFilterChange(e.currentTarget.value)}
                        placeholder="Filter results..."
                        class="w-full pl-9 pr-3 py-1 bg-[var(--vscode-input-background,var(--vscode-editor-background))] border border-outline-variant rounded text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-[var(--vscode-input-placeholderForeground,rgba(204,204,204,0.5))] text-on-surface"
                    />
                </div>
                <span class="text-xs text-secondary font-code shrink-0">
                    Showing {props.table.getFilteredRowModel().rows.length} of {props.totalRows}{" "}
                    rows
                </span>
            </div>

            {/* Data Table Container with Horizontal & Vertical Overflow */}
            <div class="flex-1 overflow-auto bg-surface-container-lowest p-4">
                <div class="ui-table-container">
                    <table class="w-full min-w-full text-left border-collapse">
                        <thead>
                            <tr class="ui-table-header-tr">
                                <For each={props.table.getHeaderGroups()}>
                                    {(headerGroup) => (
                                        <For each={headerGroup.headers}>
                                            {(header) => (
                                                <th
                                                    onClick={header.column.getToggleSortingHandler()}
                                                    class={`ui-table-th text-[11px] font-bold text-on-surface tracking-wider uppercase select-none ${
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
                                                            <span class="text-secondary text-[13px]">
                                                                {header.column.getIsSorted() ===
                                                                "asc" ? (
                                                                    <span class="i-iconoir-arrow-up text-[13px] text-primary" />
                                                                ) : header.column.getIsSorted() ===
                                                                  "desc" ? (
                                                                    <span class="i-iconoir-arrow-down text-[13px] text-primary" />
                                                                ) : (
                                                                    <span class="i-iconoir-arrow-up-down text-[12px] opacity-30" />
                                                                )}
                                                            </span>
                                                        </Show>
                                                    </div>
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
                                    <tr class="ui-table-tr transition-colors">
                                        <For each={row.getVisibleCells()}>
                                            {(cell) => (
                                                <td class="ui-table-td align-top">
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

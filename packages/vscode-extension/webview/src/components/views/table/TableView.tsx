import { FlexRender } from "@tanstack/solid-table";
import { For, Show } from "solid-js";

import type { ResultsTableInstance } from "@/model/types.js";

interface TableViewProps {
    table: ResultsTableInstance;
}

export function TableView(props: TableViewProps) {
    const lastDataColumn = () =>
        props.table
            .getAllFlatColumns()
            .filter((column) => column.id !== "__index")
            .at(-1);

    return (
        <div class="flex-1 overflow-auto bg-surface-container-lowest p-4">
            <div class="border border-outline-variant rounded bg-surface overflow-auto max-w-full max-h-full">
                <table
                    class="text-left border-separate border-spacing-0 table-fixed"
                    style={{
                        width: lastDataColumn()
                            ? `max(100%, ${props.table.getTotalSize()}px)`
                            : `${props.table.getTotalSize()}px`,
                    }}
                >
                    <colgroup>
                        <For each={props.table.getAllFlatColumns()}>
                            {(column) => (
                                <col
                                    style={{
                                        width:
                                            column.id === lastDataColumn()?.id
                                                ? undefined
                                                : `${column.getSize()}px`,
                                    }}
                                />
                            )}
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
                                                class={`sticky top-0 z-20 border-b border-r border-outline-variant py-2.5 text-2xs font-bold tracking-wider select-none last:border-r-0 ${
                                                    header.column.id === "__index"
                                                        ? "bg-surface-container text-secondary/70 text-center px-0"
                                                        : "bg-surface-container-high text-on-surface px-4"
                                                } ${
                                                    header.column.getCanSort()
                                                        ? "cursor-pointer hover:bg-surface-variant"
                                                        : ""
                                                }`}
                                            >
                                                <div
                                                    class={`flex items-center gap-1 ${header.column.id === "__index" ? "justify-center" : "justify-between"}`}
                                                >
                                                    <span>
                                                        <FlexRender header={header} />
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
                    <tbody class="font-mono text-xs text-on-surface">
                        <Show
                            when={props.table.getRowModel().rows.length > 0}
                            fallback={
                                <tr>
                                    <td
                                        colspan={props.table.getAllFlatColumns().length}
                                        class="py-8 text-center text-xs text-secondary font-sans"
                                    >
                                        No matching items found
                                    </td>
                                </tr>
                            }
                        >
                            <For each={props.table.getRowModel().rows}>
                                {(row) => (
                                    <tr class="hover:bg-surface-variant transition-colors">
                                        <For each={row.getAllCells()}>
                                            {(cell) => (
                                                <td
                                                    class={`border-b border-r border-outline-variant/30 py-2.5 align-top last:border-r-0 ${
                                                        cell.column.id === "__index"
                                                            ? "bg-surface-container/40 text-center whitespace-nowrap px-0"
                                                            : "text-on-surface break-words overflow-wrap-anywhere px-4"
                                                    }`}
                                                >
                                                    <FlexRender cell={cell} />
                                                </td>
                                            )}
                                        </For>
                                    </tr>
                                )}
                            </For>
                        </Show>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

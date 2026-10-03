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
        <div class="flex-1 min-h-0 overflow-hidden bg-surface">
            <div class="bg-surface overflow-auto w-full h-full">
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
                                                class={`sticky top-0 z-20 border-b border-r border-outline-variant py-1.5 text-2xs font-bold tracking-wider select-none last:border-r-0 ${
                                                    header.column.id === "__index"
                                                        ? "bg-surface-container text-secondary/70 text-right px-2"
                                                        : "bg-surface-container text-on-container px-2"
                                                } ${
                                                    header.column.getCanSort()
                                                        ? "cursor-pointer hover:bg-row-hover"
                                                        : ""
                                                }`}
                                            >
                                                <div
                                                    class={`flex items-center ${header.column.id === "__index" ? "justify-end text-xs tracking-normal" : "justify-between gap-1"}`}
                                                >
                                                    <span>
                                                        <FlexRender header={header} />
                                                    </span>
                                                    <Show when={header.column.getCanSort()}>
                                                        <span class="text-secondary text-xs">
                                                            {header.column.getIsSorted() ===
                                                            "asc" ? (
                                                                <span class="i-iconoir-arrow-up text-xs text-on-container" />
                                                            ) : header.column.getIsSorted() ===
                                                              "desc" ? (
                                                                <span class="i-iconoir-arrow-down text-xs text-on-container" />
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
                                                        class={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none hover:bg-resize/50 transition-colors ${
                                                            header.column.getIsResizing()
                                                                ? "bg-resize w-1 opacity-100"
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
                                    <tr class="hover:bg-row-hover transition-colors">
                                        <For each={row.getAllCells()}>
                                            {(cell) => (
                                                <td
                                                    class={`border-b border-r border-row-divider py-1.5 align-top last:border-r-0 ${
                                                        cell.column.id === "__index"
                                                            ? "text-secondary text-right whitespace-nowrap px-2"
                                                            : "text-on-surface break-words overflow-wrap-anywhere px-2"
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

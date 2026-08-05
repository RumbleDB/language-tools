import {
    createSolidTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    flexRender,
    type ColumnDef,
    type SortingState,
    type PaginationState,
} from "@tanstack/solid-table";
import { createSignal, onMount, createMemo, Show, For } from "solid-js";

import type { ExecutionResultData } from "./types.js";

declare global {
    interface Window {
        __INITIAL_DATA__?: ExecutionResultData;
    }
}

export function App() {
    const [data, setData] = createSignal<ExecutionResultData | undefined>(window.__INITIAL_DATA__);
    const [copied, setCopied] = createSignal(false);
    const [globalFilter, setGlobalFilter] = createSignal("");
    const [sorting, setSorting] = createSignal<SortingState>([]);
    const [viewMode, setViewMode] = createSignal<"table" | "raw">("table");
    const [pagination, setPagination] = createSignal<PaginationState>({
        pageIndex: 0,
        pageSize: 50,
    });

    onMount(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message && message.type === "SET_DATA") {
                setData(message.data);
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    });

    const copyOutput = () => {
        const d = data();
        if (!d) return;
        const content = d.output ?? d.error ?? "";
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const parsedItems = createMemo(() => {
        const d = data();
        if (!d || !d.output || d.error) return [];

        const rawText = d.output.trim();
        if (!rawText) return [];

        try {
            const parsed = JSON.parse(rawText);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            const items: unknown[] = [];
            const lines = rawText.split("\n");
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    items.push(JSON.parse(trimmed));
                } catch {
                    items.push(line);
                }
            }
            return items;
        }
    });

    const isAllObjects = createMemo(() => {
        const items = parsedItems();
        return (
            items.length > 0 &&
            items.every((it) => typeof it === "object" && it !== null && !Array.isArray(it))
        );
    });

    const tableColumns = createMemo<ColumnDef<Record<string, unknown>>[]>(() => {
        const items = parsedItems();
        if (items.length === 0) return [];

        if (isAllObjects()) {
            const keySet = new Set<string>();
            items.forEach((it) => {
                if (typeof it === "object" && it !== null) {
                    Object.keys(it).forEach((k) => keySet.add(k));
                }
            });

            const indexCol: ColumnDef<Record<string, unknown>> = {
                id: "__index",
                header: "ID",
                accessorFn: (_, index) => index + 1,
                cell: (info) => (
                    <span class="text-secondary font-code text-xs select-none">
                        {String(info.getValue())}
                    </span>
                ),
            };

            const dataCols: ColumnDef<Record<string, unknown>>[] = Array.from(keySet).map(
                (key) => ({
                    id: key,
                    accessorKey: key,
                    header: key.toUpperCase(),
                    cell: (info) => {
                        const val = info.getValue();
                        if (val === undefined || val === null) {
                            return <span class="text-secondary/50 italic font-code">null</span>;
                        }
                        if (typeof val === "boolean") {
                            return (
                                <span
                                    class={
                                        val
                                            ? "text-success font-semibold"
                                            : "text-error font-semibold"
                                    }
                                >
                                    {String(val)}
                                </span>
                            );
                        }
                        if (typeof val === "number") {
                            return (
                                <span class="text-[var(--vscode-symbolIcon-numberForeground,var(--vscode-editor-foreground))] font-code">
                                    {val}
                                </span>
                            );
                        }
                        if (typeof val === "object") {
                            return (
                                <span class="text-[var(--vscode-symbolIcon-stringForeground,var(--vscode-editor-foreground))] font-code">
                                    {JSON.stringify(val)}
                                </span>
                            );
                        }
                        return <span class="text-on-surface font-code">{String(val)}</span>;
                    },
                }),
            );

            return [indexCol, ...dataCols];
        }

        return [
            {
                id: "__index",
                header: "ID",
                accessorFn: (_, index) => index + 1,
                cell: (info) => (
                    <span class="text-secondary font-code text-xs select-none">
                        {String(info.getValue())}
                    </span>
                ),
            },
            {
                id: "value",
                header: "VALUE",
                accessorFn: (row) => (typeof row === "object" ? JSON.stringify(row) : String(row)),
                cell: (info) => (
                    <span class="text-on-surface font-code">{String(info.getValue())}</span>
                ),
            },
        ];
    });

    const tableData = createMemo<Record<string, unknown>[]>(() => {
        return parsedItems().map((item) => {
            if (typeof item === "object" && item !== null && !Array.isArray(item)) {
                return item as Record<string, unknown>;
            }
            return { value: item };
        });
    });

    const table = createSolidTable({
        get data() {
            return tableData();
        },
        get columns() {
            return tableColumns();
        },
        state: {
            get sorting() {
                return sorting();
            },
            get globalFilter() {
                return globalFilter();
            },
            get pagination() {
                return pagination();
            },
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    const fileName = () => {
        const uri = data()?.fileUri;
        if (!uri) return "Query Results";
        return uri.split("/").pop() ?? uri;
    };

    const isSuccess = () => {
        const d = data();
        return Boolean(d && !d.error && d.output !== undefined);
    };

    return (
        <div class="bg-surface text-on-surface h-screen w-full flex flex-col overflow-hidden font-sans select-text box-border">
            <Show when={data()}>
                {(res) => (
                    <>
                        {/* TopAppBar */}
                        <header class="bg-surface ui-border-b min-h-[36px] py-1 px-3 flex items-center justify-between gap-2 w-full shrink-0 z-10 box-border">
                            <div class="flex items-center gap-2 text-secondary min-w-0">
                                <span class="i-lucide-file-text text-[16px] text-primary shrink-0" />
                                <h1 class="text-[14px] font-semibold text-on-surface truncate max-w-[240px] sm:max-w-xs">
                                    {fileName()}
                                </h1>
                                <Show
                                    when={isSuccess()}
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
                                <Show when={isSuccess() && parsedItems().length > 0}>
                                    <div class="flex items-center bg-surface-container rounded p-0.5 border border-outline-variant">
                                        <button
                                            onClick={() => setViewMode("table")}
                                            class={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                                                viewMode() === "table"
                                                    ? "bg-primary text-on-primary font-semibold"
                                                    : "text-secondary hover:text-on-surface"
                                            }`}
                                        >
                                            <span class="i-lucide-table-properties text-[13px]" />
                                            Table
                                        </button>
                                        <button
                                            onClick={() => setViewMode("raw")}
                                            class={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                                                viewMode() === "raw"
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

                        {/* Main Content Area */}
                        <main class="flex-1 flex flex-col bg-surface overflow-hidden relative w-full">
                            <Show when={res().error}>
                                <div class="p-4 sm:p-6">
                                    <div class="bg-error-container text-on-error-container p-4 rounded border border-error/30 font-code text-xs whitespace-pre-wrap flex items-start gap-2">
                                        <span class="i-lucide-alert-triangle text-[16px] shrink-0 mt-0.5 text-error" />
                                        <div class="flex-1">{res().error}</div>
                                    </div>
                                </div>
                            </Show>

                            <Show when={!res().error && res().output !== undefined}>
                                <Show
                                    when={parsedItems().length > 0}
                                    fallback={
                                        <div class="p-4 sm:p-6">
                                            <div class="inline-flex items-center gap-1.5 text-xs bg-surface-container px-3 py-1.5 rounded border border-outline-variant text-secondary">
                                                <span class="i-lucide-info text-[15px]" />
                                                Sequence is empty ()
                                            </div>
                                        </div>
                                    }
                                >
                                    <Show when={viewMode() === "table"}>
                                        {/* Toolbar / Search */}
                                        <div class="px-4 py-2.5 flex items-center justify-between gap-2 border-b ui-border-b bg-surface-container-lowest shrink-0 flex-wrap">
                                            <div class="relative w-full max-w-xs sm:max-w-md">
                                                <span class="i-lucide-search absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[14px]" />
                                                <input
                                                    type="text"
                                                    value={globalFilter()}
                                                    onInput={(e) =>
                                                        setGlobalFilter(e.currentTarget.value)
                                                    }
                                                    placeholder="Filter results..."
                                                    class="w-full pl-9 pr-3 py-1 bg-[var(--vscode-input-background,var(--vscode-editor-background))] border border-outline-variant rounded text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-[var(--vscode-input-placeholderForeground,rgba(204,204,204,0.5))] text-on-surface"
                                                />
                                            </div>
                                            <span class="text-xs text-secondary font-code shrink-0">
                                                Showing {table.getFilteredRowModel().rows.length} of{" "}
                                                {tableData().length} rows
                                            </span>
                                        </div>

                                        {/* Data Table Container with Horizontal & Vertical Overflow */}
                                        <div class="flex-1 overflow-auto bg-surface-container-lowest p-4 sm:p-6">
                                            <div class="ui-table-container">
                                                <table class="w-full min-w-full text-left border-collapse">
                                                    <thead>
                                                        <tr class="ui-table-header-tr">
                                                            <For each={table.getHeaderGroups()}>
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
                                                                                            header
                                                                                                .column
                                                                                                .columnDef
                                                                                                .header,
                                                                                            header.getContext(),
                                                                                        )}
                                                                                    </span>
                                                                                    <Show
                                                                                        when={header.column.getCanSort()}
                                                                                    >
                                                                                        <span class="text-secondary text-[13px]">
                                                                                            {header.column.getIsSorted() ===
                                                                                            "asc" ? (
                                                                                                <span class="i-lucide-arrow-up text-[13px] text-primary" />
                                                                                            ) : header.column.getIsSorted() ===
                                                                                              "desc" ? (
                                                                                                <span class="i-lucide-arrow-down text-[13px] text-primary" />
                                                                                            ) : (
                                                                                                <span class="i-lucide-arrow-up-down text-[12px] opacity-30" />
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
                                                        <For each={table.getRowModel().rows}>
                                                            {(row) => (
                                                                <tr class="ui-table-tr transition-colors">
                                                                    <For
                                                                        each={row.getVisibleCells()}
                                                                    >
                                                                        {(cell) => (
                                                                            <td class="ui-table-td align-top">
                                                                                {flexRender(
                                                                                    cell.column
                                                                                        .columnDef
                                                                                        .cell,
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
                                    </Show>

                                    <Show when={viewMode() === "raw"}>
                                        <div class="flex-1 overflow-auto p-4 sm:p-6 bg-surface-container-lowest">
                                            <div class="bg-surface border border-outline-variant rounded p-4 font-code text-xs whitespace-pre-wrap text-on-surface">
                                                {res().output}
                                            </div>
                                        </div>
                                    </Show>

                                    {/* Footer Bar */}
                                    <footer class="bg-surface-container-low ui-border-t min-h-[32px] py-1 px-3 w-full shrink-0 flex items-center justify-between gap-3 font-code text-xs z-10 flex-wrap box-border">
                                        <div class="flex items-center gap-3 text-secondary shrink-0">
                                            <span class="flex items-center gap-1">
                                                <span class="i-lucide-timer text-[14px]" />
                                                {res().durationMs}ms
                                            </span>
                                            <span class="flex items-center gap-1">
                                                <span class="i-lucide-rows-3 text-[14px]" />
                                                Rows: {parsedItems().length}
                                            </span>
                                        </div>

                                        <div class="flex items-center gap-3 shrink-0">
                                            <div class="flex items-center gap-1">
                                                <button
                                                    onClick={() => table.previousPage()}
                                                    disabled={!table.getCanPreviousPage()}
                                                    class="p-1 hover:bg-surface-variant rounded transition-colors disabled:opacity-30 cursor-pointer flex items-center justify-center text-on-surface"
                                                >
                                                    <span class="i-lucide-chevron-left text-[14px]" />
                                                </button>

                                                <span class="px-1 text-xs text-secondary font-medium">
                                                    Page {table.getState().pagination.pageIndex + 1}{" "}
                                                    of {table.getPageCount()}
                                                </span>

                                                <button
                                                    onClick={() => table.nextPage()}
                                                    disabled={!table.getCanNextPage()}
                                                    class="p-1 hover:bg-surface-variant rounded transition-colors disabled:opacity-30 cursor-pointer flex items-center justify-center text-on-surface"
                                                >
                                                    <span class="i-lucide-chevron-right text-[14px]" />
                                                </button>
                                            </div>

                                            <div class="w-px h-3.5 bg-outline-variant" />

                                            <div class="flex items-center gap-1.5 text-secondary">
                                                <span class="text-[11px]">Show:</span>
                                                <select
                                                    value={pagination().pageSize}
                                                    onChange={(e) => {
                                                        const size = Number(e.currentTarget.value);
                                                        table.setPageSize(size);
                                                    }}
                                                    class="bg-transparent border-none p-0 text-[11px] font-medium focus:ring-0 cursor-pointer text-on-surface"
                                                >
                                                    <option
                                                        value={20}
                                                        class="bg-surface text-on-surface"
                                                    >
                                                        20
                                                    </option>
                                                    <option
                                                        value={50}
                                                        class="bg-surface text-on-surface"
                                                    >
                                                        50
                                                    </option>
                                                    <option
                                                        value={100}
                                                        class="bg-surface text-on-surface"
                                                    >
                                                        100
                                                    </option>
                                                    <option
                                                        value={250}
                                                        class="bg-surface text-on-surface"
                                                    >
                                                        250
                                                    </option>
                                                </select>
                                            </div>
                                        </div>

                                        <div class="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={copyOutput}
                                                class="px-2 py-0.5 text-on-surface hover:bg-surface-variant rounded transition-colors flex items-center gap-1 cursor-pointer font-sans"
                                            >
                                                <span
                                                    class={
                                                        copied()
                                                            ? "i-lucide-check text-[14px] text-success"
                                                            : "i-lucide-copy text-[14px]"
                                                    }
                                                />
                                                {copied() ? "Copied" : "Copy Results"}
                                            </button>
                                        </div>
                                    </footer>
                                </Show>
                            </Show>
                        </main>
                    </>
                )}
            </Show>
        </div>
    );
}

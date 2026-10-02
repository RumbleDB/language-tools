import {
    createTable,
    tableFeatures,
    columnFilteringFeature,
    rowSortingFeature,
    globalFilteringFeature,
    rowPaginationFeature,
    columnSizingFeature,
    columnResizingFeature,
    createSortedRowModel,
    createFilteredRowModel,
    createPaginatedRowModel,
    type ColumnDef,
    type SortingState,
    type PaginationState,
} from "@tanstack/solid-table";
import { createSignal, onMount, onCleanup, createMemo, Show, type JSX } from "solid-js";

import { ErrorView } from "./components/ErrorView.js";
import { Footer } from "./components/Footer.js";
import { Header } from "./components/Header.js";
import { RawView } from "./components/RawView.js";
import { TableView } from "./components/Table.js";
import type { ExecutionResultData, RunQueryItem } from "./types.js";
import { createCopyAction } from "./utils/clipboard.js";
import { formatError } from "./utils/format-error.js";
import {
    formatCell,
    formatRawOutput,
    projectTableRows,
    type ResultTableRow,
} from "./utils/result-items.js";

declare global {
    interface Window {
        __INITIAL_DATA__?: ExecutionResultData;
    }
}

const features = tableFeatures({
    columnFilteringFeature,
    rowSortingFeature,
    globalFilteringFeature,
    rowPaginationFeature,
    columnSizingFeature,
    columnResizingFeature,
    sortedRowModel: createSortedRowModel(),
    filteredRowModel: createFilteredRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
});

export type TFeatures = typeof features;
export type TData = ResultTableRow;

const INDEX_COLUMN: ColumnDef<TFeatures, TData> = {
    id: "__index",
    header: "#",
    size: 60,
    minSize: 50,
    maxSize: 80,
    accessorFn: (_: TData, index: number) => index + 1,
    cell: (info) => (
        <span class="text-secondary/60 font-mono text-xs select-none tabular-nums">
            {String(info.getValue())}
        </span>
    ),
};

function renderCellValue(items: RunQueryItem[] | undefined): JSX.Element {
    const missing = items === undefined;
    const isNull = items?.length === 1 && items[0]?.kind === "null";
    return (
        <span
            class={`font-mono ${missing || isNull ? "text-secondary/50 italic" : "text-on-surface"}`}
            title={missing ? "Missing field" : items.map((item) => item.type).join(", ")}
        >
            {formatCell(items)}
        </span>
    );
}

function getDynamicColumnSize(items: TData[], key: string): number {
    const maxLen = Math.max(
        key.length,
        ...items.slice(0, 30).map((item) => formatCell(item[key]).length),
    );
    return Math.min(Math.max(maxLen * 8 + 36, 90), 450);
}

export function App() {
    const [data, setData] = createSignal<ExecutionResultData | undefined>(window.__INITIAL_DATA__);
    const { copied, copy } = createCopyAction();
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
                setGlobalFilter("");
                setSorting([]);
                setPagination((previous) => ({ ...previous, pageIndex: 0 }));
            }
        };

        window.addEventListener("message", handleMessage);
        onCleanup(() => window.removeEventListener("message", handleMessage));
    });

    const copyOutput = () => {
        const d = data();
        if (!d) return;
        copy(d.error ? formatError(d.error, d.fileUri) : formatRawOutput(d.items ?? []));
    };

    const resultItems = createMemo(() => data()?.items ?? []);
    const projection = createMemo(() => projectTableRows(resultItems()));
    const tableData = () => projection().rows;

    const tableColumns = createMemo<ColumnDef<TFeatures, TData>[]>(() => {
        if (resultItems().length === 0) return [];
        if (projection().objects) {
            const keys = new Set(tableData().flatMap((row) => Object.keys(row)));
            return [
                INDEX_COLUMN,
                ...Array.from(keys).map((key): ColumnDef<TFeatures, TData> => ({
                    id: `field:${key}`,
                    accessorFn: (row) => formatCell(row[key]),
                    header: key,
                    size: getDynamicColumnSize(tableData(), key),
                    minSize: 80,
                    cell: (info) => renderCellValue(info.row.original[key]),
                })),
            ];
        }
        return [
            INDEX_COLUMN,
            {
                id: "value",
                accessorFn: (row) => formatCell(row.value),
                header: "Value",
                size: 400,
                minSize: 150,
                cell: (info) => renderCellValue(info.row.original.value),
            },
        ];
    });

    const table = createTable({
        features,
        get data() {
            return tableData();
        },
        get columns() {
            return tableColumns();
        },
        columnResizeMode: "onChange",
        defaultColumn: {
            size: 160,
            minSize: 60,
        },
        get state() {
            return {
                sorting: sorting(),
                globalFilter: globalFilter(),
                pagination: pagination(),
            };
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: setPagination,
    });

    const fileName = () => {
        const uri = data()?.fileUri;
        if (!uri) return "Query Results";
        return uri.split("/").pop() ?? uri;
    };

    const isSuccess = () => {
        const d = data();
        return Boolean(d && !d.error && d.items !== null);
    };

    return (
        <div
            class="bg-surface text-on-surface h-screen w-full flex flex-col overflow-hidden font-sans select-text box-border"
            data-vscode-context='{"preventDefaultContextMenuItems": false}'
        >
            <Show when={data()}>
                {(res) => (
                    <>
                        <Header
                            fileName={fileName()}
                            isSuccess={isSuccess()}
                            hasItems={resultItems().length > 0}
                            viewMode={viewMode()}
                            onViewModeChange={setViewMode}
                            durationMs={res().durationMs}
                            rowCount={resultItems().length}
                            copied={copied()}
                            onCopy={copyOutput}
                        />

                        <main class="flex-1 flex flex-col bg-surface overflow-hidden relative w-full">
                            <Show when={res().error}>
                                <ErrorView
                                    error={res().error!}
                                    fileUri={res().fileUri}
                                    durationMs={res().durationMs}
                                />
                            </Show>

                            <Show when={!res().error && res().items !== null}>
                                <Show
                                    when={resultItems().length > 0}
                                    fallback={
                                        <div class="p-4 sm:p-6">
                                            <div class="inline-flex items-center gap-1.5 text-xs bg-surface-container px-3 py-1.5 rounded border border-outline-variant text-secondary">
                                                <span class="i-iconoir-info text-sm" />
                                                Sequence is empty ()
                                            </div>
                                        </div>
                                    }
                                >
                                    <Show when={viewMode() === "table"}>
                                        <TableView
                                            table={table}
                                            globalFilter={globalFilter()}
                                            onGlobalFilterChange={setGlobalFilter}
                                            totalRows={tableData().length}
                                        />
                                        <Footer
                                            table={table}
                                            pageSize={pagination().pageSize}
                                            onPageSizeChange={(size) => table.setPageSize(size)}
                                        />
                                    </Show>

                                    <Show when={viewMode() === "raw"}>
                                        <RawView items={res().items!} />
                                    </Show>
                                </Show>
                            </Show>
                        </main>
                    </>
                )}
            </Show>
        </div>
    );
}

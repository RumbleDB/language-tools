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
import { createSignal, onMount, createMemo, Show, type JSX } from "solid-js";

import { ErrorView } from "./components/ErrorView.js";
import { Footer } from "./components/Footer.js";
import { Header } from "./components/Header.js";
import { RawView } from "./components/RawView.js";
import { TableView } from "./components/Table.js";
import type { ExecutionResultData } from "./types.js";
import { createCopyAction } from "./utils/clipboard.js";
import { formatError } from "./utils/format-error.js";
import { type ViewFormat, type IndentMode, formatRawOutput } from "./utils/format-raw.js";

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
export type TData = Record<string, unknown>;

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

function renderCellValue(val: unknown): JSX.Element {
    if (val === undefined || val === null) {
        return <span class="text-secondary/50 italic font-mono">null</span>;
    }
    if (typeof val === "boolean") {
        return (
            <span class={val ? "text-success font-semibold" : "text-error font-semibold"}>
                {String(val)}
            </span>
        );
    }
    if (typeof val === "number") {
        return <span class="text-token-number font-mono">{val}</span>;
    }
    if (typeof val === "object") {
        return <span class="text-token-string font-mono">{JSON.stringify(val)}</span>;
    }
    return <span class="text-on-surface font-mono">{String(val)}</span>;
}

function getDynamicColumnSize(items: Record<string, unknown>[], key: string): number {
    const sample = items.slice(0, 30);
    const maxLen = Math.max(
        key.length,
        ...sample.map((it) => {
            const val = it[key];
            if (val === null || val === undefined) return 0;
            return typeof val === "object" ? JSON.stringify(val).length : String(val).length;
        }),
    );
    return Math.min(Math.max(maxLen * 8 + 36, 90), 450);
}

export function App() {
    const [data, setData] = createSignal<ExecutionResultData | undefined>(window.__INITIAL_DATA__);
    const { copied, copy } = createCopyAction();
    const [globalFilter, setGlobalFilter] = createSignal("");
    const [sorting, setSorting] = createSignal<SortingState>([]);
    const [viewMode, setViewMode] = createSignal<"table" | "raw">("table");
    const [rawFormat, setRawFormat] = createSignal<ViewFormat>("sequence");
    const [rawIndent, setRawIndent] = createSignal<IndentMode>("pretty");
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
        if (viewMode() === "raw") {
            copy(formatRawOutput(d.output ?? "", rawFormat(), rawIndent()));
        } else {
            copy(d.output ?? formatError(d.error, d.fileUri));
        }
    };

    // The backend always serializes the result sequence as a JSON array,
    // e.g. (1, 2, 3) → [1,2,3] and [1,2,3] → [[1,2,3]].
    // Each element of the outer array is one sequence item.
    const parsedItems = createMemo(() => {
        const d = data();
        if (!d || !d.output || d.error) return [];

        const rawText = d.output.trim();
        if (!rawText) return [];

        const parsed = JSON.parse(rawText) as unknown;
        return Array.isArray(parsed) ? parsed : [parsed];
    });

    const isAllObjects = createMemo(() => {
        const items = parsedItems();
        return (
            items.length > 0 &&
            items.every((it) => typeof it === "object" && it !== null && !Array.isArray(it))
        );
    });

    const tableColumns = createMemo<ColumnDef<TFeatures, TData>[]>(() => {
        const items = parsedItems();
        if (items.length === 0) return [];

        if (isAllObjects()) {
            const keySet = new Set<string>();
            items.forEach((it) => {
                if (typeof it === "object" && it !== null) {
                    Object.keys(it).forEach((k) => keySet.add(k));
                }
            });

            const dataCols: ColumnDef<TFeatures, TData>[] = Array.from(keySet).map((key) => ({
                id: key,
                accessorKey: key,
                header: key.toUpperCase(),
                size: getDynamicColumnSize(items as TData[], key),
                minSize: 80,
                cell: (info) => renderCellValue(info.getValue()),
            }));

            return [INDEX_COLUMN, ...dataCols];
        }

        return [
            INDEX_COLUMN,
            {
                id: "value",
                accessorKey: "value",
                header: "VALUE",
                size: 400,
                minSize: 150,
                cell: (info) => renderCellValue(info.getValue()),
            },
        ];
    });

    const tableData = createMemo<TData[]>(() => {
        return parsedItems().map((item) => {
            if (typeof item === "object" && item !== null && !Array.isArray(item)) {
                return item as TData;
            }
            return { value: item };
        });
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
        return Boolean(d && !d.error && d.output !== undefined);
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
                            hasItems={parsedItems().length > 0}
                            viewMode={viewMode()}
                            onViewModeChange={setViewMode}
                            durationMs={res().durationMs}
                            rowCount={parsedItems().length}
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

                            <Show when={!res().error && res().output !== undefined}>
                                <Show
                                    when={parsedItems().length > 0}
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
                                        <RawView
                                            output={res().output ?? ""}
                                            format={rawFormat()}
                                            onFormatChange={setRawFormat}
                                            indent={rawIndent()}
                                            onIndentChange={setRawIndent}
                                        />
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

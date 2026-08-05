import {
    createSolidTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    type ColumnDef,
    type SortingState,
    type PaginationState,
} from "@tanstack/solid-table";
import { createSignal, onMount, createMemo, Show } from "solid-js";

import { Footer } from "./components/Footer.js";
import { Header } from "./components/Header.js";
import { RawView } from "./components/RawView.js";
import { TableView } from "./components/Table.js";
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

    const copyOutput = async () => {
        const d = data();
        if (!d) return;
        const content = d.output ?? d.error ?? "";

        let success = false;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(content);
                success = true;
            }
        } catch {
            success = false;
        }

        if (!success) {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = content;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                textArea.style.top = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand("copy");
                textArea.remove();
            } catch (err) {
                console.error("Copy failed:", err);
            }
        }

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
                        />

                        <main class="flex-1 flex flex-col bg-surface overflow-hidden relative w-full">
                            <Show when={res().error}>
                                <div class="p-4 sm:p-6">
                                    <div class="bg-error-container text-on-error-container p-4 rounded border border-error/30 font-code text-xs whitespace-pre-wrap flex items-start gap-2">
                                        <span class="i-iconoir-alert-triangle text-[16px] shrink-0 mt-0.5 text-error" />
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
                                                <span class="i-iconoir-info text-[15px]" />
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
                                    </Show>

                                    <Show when={viewMode() === "raw"}>
                                        <RawView output={res().output ?? ""} />
                                    </Show>

                                    <Footer
                                        durationMs={res().durationMs}
                                        rowCount={parsedItems().length}
                                        table={table}
                                        pageSize={pagination().pageSize}
                                        onPageSizeChange={(size) => table.setPageSize(size)}
                                        copied={copied()}
                                        onCopy={copyOutput}
                                    />
                                </Show>
                            </Show>
                        </main>
                    </>
                )}
            </Show>
        </div>
    );
}

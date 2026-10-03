import { createSignal, onMount, onCleanup, createMemo, Show } from "solid-js";

import { PaginationControls } from "@/components/PaginationControls.js";
import { ResultActions } from "@/components/ResultActions.js";
import { ResultsHeader } from "@/components/ResultsHeader.js";
import { SearchBar } from "@/components/SearchBar.js";
import { ErrorView } from "@/components/views/ErrorView.js";
import { ListView } from "@/components/views/ListView.js";
import { TableView } from "@/components/views/table/TableView.js";
import { createResultsModel } from "@/model/results-model.js";

import type { ExecutionResultData, ViewMode } from "./types.js";
import { vscode } from "./vscode.js";

declare global {
    interface Window {
        __INITIAL_DATA__?: ExecutionResultData;
    }
}

export function App() {
    const [data, setData] = createSignal<ExecutionResultData | undefined>(window.__INITIAL_DATA__);
    const [viewMode, setViewMode] = createSignal<ViewMode>("list");
    const [running, setRunning] = createSignal(false);

    onMount(() => {
        onCleanup(
            vscode.onMessage("SET_DATA", (message) => {
                setData(message.data);
            }),
        );
        onCleanup(vscode.onMessage("SET_RUNNING", (message) => setRunning(message.running)));
    });

    const resultItems = createMemo(() => data()?.items ?? []);
    const results = createResultsModel(resultItems);

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
                        <ResultsHeader
                            isSuccess={isSuccess()}
                            hasItems={resultItems().length > 0}
                            viewMode={viewMode()}
                            onViewModeChange={setViewMode}
                            durationMs={res().durationMs}
                            rowCount={resultItems().length}
                            running={running()}
                            onRerun={() => vscode.postMessage("RERUN_QUERY", {})}
                            actions={<ResultActions items={results.selection().items} />}
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
                                    {/* Unified Search Toolbar */}
                                    <div class="px-4 py-2.5 flex items-center justify-between gap-2 border-b border-outline-variant bg-surface shrink-0 flex-wrap">
                                        <SearchBar
                                            value={results.globalFilter()}
                                            onChange={results.setGlobalFilter}
                                        />
                                        <span class="text-xs text-secondary shrink-0">
                                            Showing {results.filteredCount()} of{" "}
                                            {results.totalCount()}{" "}
                                            {results.totalCount() === 1 ? "item" : "items"}
                                        </span>
                                    </div>

                                    {/* View Presentations */}
                                    <Show when={viewMode() === "list"}>
                                        <ListView
                                            rows={results.table.getRowModel().rows}
                                            indexColumnWidth={results.table
                                                .getColumn("__index")!
                                                .getSize()}
                                        />
                                    </Show>

                                    <Show when={viewMode() === "table"}>
                                        <TableView table={results.table} />
                                    </Show>

                                    {/* Unified Pagination Controls */}
                                    <PaginationControls
                                        pageIndex={results.pagination.state().pageIndex}
                                        pageCount={results.pagination.pageCount()}
                                        pageSize={results.pagination.state().pageSize}
                                        canPreviousPage={results.pagination.canPreviousPage()}
                                        canNextPage={results.pagination.canNextPage()}
                                        onPreviousPage={results.pagination.previousPage}
                                        onNextPage={results.pagination.nextPage}
                                        onPageChange={results.pagination.setPageIndex}
                                        onPageSizeChange={results.pagination.setPageSize}
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

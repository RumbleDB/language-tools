import { createSignal, onMount, onCleanup, createMemo, Show } from "solid-js";

import { ResultActions } from "@/components/ResultActions.js";
import { ResultsHeader } from "@/components/ResultsHeader.js";
import { ErrorView } from "@/components/views/ErrorView.js";
import { InspectView } from "@/components/views/InspectView.js";
import { RawView } from "@/components/views/RawView.js";
import { TableView } from "@/components/views/table/TableView.js";
import { projectTableRows, type ResultSelection } from "@/utils/result-items.js";

import type { ExecutionResultData, ViewMode } from "./types.js";
import { vscode } from "./vscode.js";

declare global {
    interface Window {
        __INITIAL_DATA__?: ExecutionResultData;
    }
}

export function App() {
    const [data, setData] = createSignal<ExecutionResultData | undefined>(window.__INITIAL_DATA__);
    const [tableSelection, setTableSelection] = createSignal<ResultSelection>();
    const [viewMode, setViewMode] = createSignal<ViewMode>("inspect");
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
    const fullSelection = createMemo(() => ({
        items: resultItems(),
        ...projectTableRows(resultItems()),
    }));
    const actionSelection = () =>
        viewMode() === "table" ? (tableSelection() ?? fullSelection()) : fullSelection();

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
                            actions={
                                <ResultActions
                                    items={actionSelection().items}
                                    rows={actionSelection().rows}
                                    columns={actionSelection().columns}
                                    tableView={viewMode() === "table"}
                                />
                            }
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
                                    <div
                                        class="flex-1 flex flex-col overflow-hidden"
                                        classList={{ hidden: viewMode() !== "inspect" }}
                                    >
                                        <InspectView items={res().items!} />
                                    </div>

                                    <div
                                        class="flex-1 flex flex-col overflow-hidden"
                                        classList={{ hidden: viewMode() !== "table" }}
                                    >
                                        <TableView
                                            items={res().items!}
                                            onSelectionChange={setTableSelection}
                                        />
                                    </div>

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

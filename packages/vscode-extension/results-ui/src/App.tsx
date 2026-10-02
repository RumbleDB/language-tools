import { createSignal, onMount, onCleanup, createMemo, Show } from "solid-js";

import { ErrorView } from "./components/ErrorView.js";
import { Header } from "./components/Header.js";
import { RawView } from "./components/RawView.js";
import { ResultsTable } from "./components/ResultsTable.js";
import type { ExecutionResultData } from "./types.js";
import { createCopyAction } from "./utils/clipboard.js";
import { formatError } from "./utils/format-error.js";
import { formatRawOutput } from "./utils/result-items.js";

declare global {
    interface Window {
        __INITIAL_DATA__?: ExecutionResultData;
    }
}

export function App() {
    const [data, setData] = createSignal<ExecutionResultData | undefined>(window.__INITIAL_DATA__);
    const { copied, copy } = createCopyAction();
    const [viewMode, setViewMode] = createSignal<"table" | "raw">("table");

    onMount(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message && message.type === "SET_DATA") {
                setData(message.data);
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
                                    <div
                                        class="flex-1 flex flex-col overflow-hidden"
                                        classList={{ hidden: viewMode() !== "table" }}
                                    >
                                        <ResultsTable items={res().items!} />
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

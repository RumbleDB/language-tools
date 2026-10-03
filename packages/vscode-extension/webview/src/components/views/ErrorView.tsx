import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import type { ExecutionResultData } from "@/types.js";
import { createCopyAction } from "@/utils/clipboard.js";
import { formatDuration } from "@/utils/format-duration.js";
import { formatError } from "@/utils/format-error.js";
import { vscode } from "@/vscode.js";

interface ErrorViewProps {
    error: NonNullable<ExecutionResultData["error"]>;
    fileUri: string;
    durationMs: number;
}

export function ErrorView(props: ErrorViewProps) {
    const { copied, copy } = createCopyAction();
    const [navigationError, setNavigationError] = createSignal("");
    const [copyError, setCopyError] = createSignal("");
    onCleanup(
        vscode.onMessage("OPEN_ERROR_LOCATION_ERROR", (message) => {
            setNavigationError(message.message);
        }),
    );

    const targetLocation = () => props.error.location || props.fileUri;
    const targetRange = () => (props.error.location ? props.error.range : null);
    const fullPath = createMemo(() => {
        try {
            const target = new URL(targetLocation());
            return target.protocol === "file:"
                ? decodeURIComponent(target.pathname)
                : targetLocation();
        } catch {
            return targetLocation();
        }
    });
    const locationLabel = () => {
        if (!props.error.location) return "Open query";
        const name = fullPath().split(/[\\/]/).pop() || fullPath();
        const range = targetRange();
        return range ? `${name}:${range.start.line + 1}:${range.start.character + 1}` : name;
    };

    const copyErrorDetails = async () => {
        setCopyError("");
        if (!(await copy(formatError(props.error, props.fileUri)))) {
            setCopyError("Unable to copy error details.");
        }
    };
    const handleOpenLocation = () => {
        setNavigationError("");
        try {
            const range = targetRange();
            vscode.postMessage("OPEN_ERROR_LOCATION", {
                location: targetLocation(),
                ...(range ? { range } : {}),
            });
        } catch (error) {
            setNavigationError(error instanceof Error ? error.message : String(error));
        }
    };

    const sourceLines = () => props.error.sourceLines ?? [];

    return (
        <div class="flex-1 w-full overflow-y-auto box-border">
            <div class="flex items-center justify-between gap-3 px-4 py-2 border-b border-outline-variant text-xs">
                <span class="text-secondary" title={`Query execution time: ${props.durationMs} ms`}>
                    Query failed · {formatDuration(props.durationMs)}
                </span>
                <button
                    type="button"
                    onClick={copyErrorDetails}
                    aria-label={copied() ? "Error details copied" : "Copy Details"}
                    title="Copy error details to clipboard"
                    class="inline-flex items-center gap-1.5 text-secondary hover:text-on-surface cursor-pointer shrink-0"
                >
                    <span
                        class={`w-3 h-3 shrink-0 ${copied() ? "i-iconoir-check text-success" : "i-iconoir-copy"}`}
                    />
                    Copy Details
                </button>
            </div>
            <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
                <section class="border border-error/30 bg-error/5 rounded-lg overflow-hidden">
                    <div class="flex items-start gap-3 p-4">
                        <span class="i-iconoir-warning-triangle text-error w-5 h-5 shrink-0 mt-0.5" />
                        <div class="min-w-0 flex-1 space-y-3">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-semibold text-sm">Query execution failed</span>
                                <Show when={props.error.code}>
                                    <span class="text-xs font-mono text-error bg-error/10 px-1.5 py-0.5 rounded break-all">
                                        {props.error.code}
                                    </span>
                                </Show>
                            </div>
                            <p role="alert" class="m-0 text-sm whitespace-pre-wrap break-words">
                                {props.error.message}
                            </p>
                        </div>
                    </div>
                    <div class="border-t border-error/20 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                        <span class="text-xs text-secondary font-mono break-all min-w-0">
                            {fullPath()}
                        </span>
                        <button
                            type="button"
                            onClick={handleOpenLocation}
                            title={fullPath()}
                            class="inline-flex items-center gap-1.5 text-xs text-link hover:text-link-hover hover:underline cursor-pointer shrink-0"
                        >
                            <span class="i-iconoir-open-new-window w-3 h-3 shrink-0" />
                            {locationLabel()}
                        </button>
                    </div>
                </section>
                <Show when={sourceLines().length > 0}>
                    <section
                        aria-label="Query source preview"
                        class="border border-outline-variant rounded-lg overflow-hidden"
                    >
                        <div class="flex items-center gap-2 flex-wrap px-4 py-2.5 bg-surface-container border-b border-outline-variant text-xs text-secondary">
                            <span class="i-iconoir-code" />
                            <span>{fullPath()}</span>
                        </div>
                        <div class="overflow-x-auto bg-surface">
                            <div class="min-w-max font-mono text-xs leading-6">
                                <For each={sourceLines()}>
                                    {(line) => (
                                        <div
                                            class={`flex py-0.5 ${line.highlighted ? "bg-error/10" : ""}`}
                                        >
                                            <span
                                                aria-hidden="true"
                                                class={`w-12 shrink-0 text-right pr-3 select-none ${line.highlighted ? "text-error" : "text-secondary"}`}
                                            >
                                                {line.number}
                                            </span>
                                            <code class="whitespace-pre pr-4 flex-1 bg-transparent">
                                                {line.before}
                                                <mark class="text-inherit bg-transparent underline decoration-error decoration-wavy underline-offset-4">
                                                    {line.selected}
                                                </mark>
                                                {line.after}
                                                {line.before || line.selected || line.after
                                                    ? ""
                                                    : " "}
                                            </code>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </div>
                    </section>
                </Show>
                <details class="border border-outline-variant rounded-lg overflow-hidden">
                    <summary class="cursor-pointer px-4 py-3 text-xs font-semibold bg-surface-container text-on-container">
                        Error details
                    </summary>
                    <pre class="m-0 p-4 font-mono text-xs whitespace-pre-wrap break-words border-t border-outline-variant">
                        {formatError(props.error, props.fileUri)}
                    </pre>
                </details>
                <Show when={navigationError()}>
                    <p role="alert" class="m-0 text-xs text-error">
                        Unable to open source: {navigationError()}
                    </p>
                </Show>
                <Show when={copyError()}>
                    <p role="alert" class="m-0 text-xs text-error">
                        {copyError()}
                    </p>
                </Show>
            </div>
        </div>
    );
}

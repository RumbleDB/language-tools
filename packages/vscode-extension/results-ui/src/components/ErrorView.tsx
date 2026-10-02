import { createMemo, createSignal, onCleanup, Show } from "solid-js";

import type { ExecutionResultData } from "../types.js";
import { createCopyAction } from "../utils/clipboard.js";
import { formatError } from "../utils/format-error.js";
import { vscode } from "../vscode.js";

interface ErrorViewProps {
    error: NonNullable<ExecutionResultData["error"]>;
    fileUri: string;
    durationMs: number;
}

function extractFileName(target: string): string {
    if (!target) return "";
    try {
        const url = new URL(target);
        const pathname = decodeURIComponent(url.pathname);
        return pathname.split("/").pop() || pathname;
    } catch {
        return target.split("/").pop() || target;
    }
}

function formatPathDisplay(target: string): string {
    if (!target) return "";
    if (target.startsWith("file://")) {
        try {
            return decodeURIComponent(new URL(target).pathname);
        } catch {
            return target.replace(/^file:\/\//, "");
        }
    }
    return target;
}

export function ErrorView(props: ErrorViewProps) {
    const { copied, copy } = createCopyAction();
    const [navigationError, setNavigationError] = createSignal("");
    onCleanup(
        vscode.onMessage("OPEN_ERROR_LOCATION_ERROR", (message) => {
            setNavigationError(message.message);
        }),
    );

    const targetLocation = createMemo(() => props.error.location || props.fileUri);

    const fileName = createMemo(() => extractFileName(targetLocation()));
    const fullPath = createMemo(() => formatPathDisplay(targetLocation()));

    const rangeInfo = createMemo(() => {
        const range = props.error.range;
        if (!range) return null;
        const startLine = range.start.line + 1;
        const startCol = range.start.character + 1;
        const endLine = range.end.line + 1;
        const endCol = range.end.character + 1;

        if (startLine === endLine && startCol === endCol) {
            return {
                humanReadable: `Line ${startLine}, Column ${startCol}`,
                short: `${startLine}:${startCol}`,
                startLine,
                startCol,
            };
        }
        if (startLine === endLine) {
            return {
                humanReadable: `Line ${startLine}, Columns ${startCol}–${endCol}`,
                short: `${startLine}:${startCol}-${endCol}`,
                startLine,
                startCol,
            };
        }
        return {
            humanReadable: `Line ${startLine}:${startCol} – Line ${endLine}:${endCol}`,
            short: `${startLine}:${startCol}-${endLine}:${endCol}`,
            startLine,
            startCol,
        };
    });

    const copyErrorDetails = () => {
        copy(formatError(props.error, props.fileUri));
    };

    const handleOpenLocation = () => {
        const loc = targetLocation();
        if (!loc) return;
        setNavigationError("");
        try {
            vscode.postMessage("OPEN_ERROR_LOCATION", {
                location: loc,
                ...(props.error.range ? { range: props.error.range } : {}),
            });
        } catch (error) {
            setNavigationError(error instanceof Error ? error.message : String(error));
        }
    };

    return (
        <div class="flex-1 w-full overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-start box-border">
            <div class="w-full bg-surface-container border border-error/35 rounded-lg shadow-sm overflow-hidden flex flex-col">
                {/* Header banner */}
                <div class="bg-error/10 border-b border-error/25 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <span class="i-iconoir-alert-triangle text-lg text-error shrink-0" />
                        <span class="font-semibold text-sm text-on-surface">Execution Error</span>
                        <Show when={props.error.code}>
                            <span class="px-2 py-0.5 rounded text-xs font-mono font-bold bg-error/20 text-error border border-error/35 tracking-wider">
                                {props.error.code}
                            </span>
                        </Show>
                    </div>

                    <button
                        type="button"
                        onClick={copyErrorDetails}
                        aria-label={copied() ? "Error details copied" : "Copy Details"}
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-2xs font-medium bg-surface text-secondary hover:text-on-surface hover:bg-surface-variant border border-outline-variant transition-colors cursor-pointer"
                        title="Copy error details to clipboard"
                    >
                        <span
                            class={
                                "w-3 h-3 shrink-0 " +
                                (copied()
                                    ? "i-iconoir-check text-success text-xs"
                                    : "i-iconoir-copy text-xs")
                            }
                        />
                        Copy Details
                    </button>
                </div>

                {/* Body Content */}
                <div class="p-4 sm:p-5 space-y-4">
                    {/* Error Message Box */}
                    <div class="space-y-1.5">
                        <div class="text-2xs font-semibold text-secondary uppercase tracking-wider">
                            Description
                        </div>
                        <div class="p-3.5 bg-surface rounded-md border border-outline-variant font-mono text-xs text-on-surface select-text overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
                            {props.error.message}
                        </div>
                    </div>

                    {/* Error Location Card (when location or fileUri is available) */}
                    <Show when={targetLocation()}>
                        <div class="space-y-1.5">
                            <div class="text-2xs font-semibold text-secondary uppercase tracking-wider">
                                Source Location
                            </div>
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-surface rounded-md border border-outline-variant hover:border-outline transition-colors">
                                <div class="min-w-0 flex items-start gap-2.5 flex-1">
                                    <span class="i-iconoir-page text-base text-secondary shrink-0 mt-0.5" />
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <span class="font-mono text-xs font-bold text-on-surface truncate">
                                                {fileName()}
                                            </span>
                                            <Show when={rangeInfo()}>
                                                {(range) => (
                                                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface font-mono text-2xs font-medium border border-outline-variant">
                                                        <span class="i-iconoir-pin text-2xs text-secondary" />
                                                        {range().humanReadable}
                                                    </span>
                                                )}
                                            </Show>
                                        </div>
                                        <div
                                            class="text-2xs text-secondary/70 truncate mt-1 font-mono select-all"
                                            title={fullPath()}
                                        >
                                            {fullPath()}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleOpenLocation}
                                    class="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-primary text-on-primary hover:opacity-90 active:scale-98 transition cursor-pointer shrink-0 shadow-sm"
                                    title={`Open ${fileName()} at error location in editor`}
                                >
                                    <span class="i-iconoir-open-new-window text-sm" />
                                    <span>
                                        {rangeInfo()
                                            ? `Go to Line ${rangeInfo()!.startLine}`
                                            : "Open in Editor"}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </Show>

                    <Show when={navigationError()}>
                        <p role="alert" class="text-xs text-error">
                            Unable to open error location: {navigationError()}
                        </p>
                    </Show>

                    {/* Footer metadata info */}
                    <div class="flex items-center justify-between pt-2 border-t border-outline-variant text-2xs text-secondary">
                        <span class="flex items-center gap-1">
                            <span class="i-iconoir-timer text-xs" />
                            Execution failed after {props.durationMs}ms
                        </span>
                        <Show when={rangeInfo()}>
                            {(range) => (
                                <span class="font-mono text-secondary/70">
                                    Position: {range().short}
                                </span>
                            )}
                        </Show>
                    </div>
                </div>
            </div>
        </div>
    );
}

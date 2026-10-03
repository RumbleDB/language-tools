import { createSignal, createMemo, For } from "solid-js";

import type { RunQueryItem } from "../../types.js";
import { formatRawOutput } from "../../utils/result-items.js";

interface RawViewProps {
    items: RunQueryItem[];
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightJsonLine(text: string): string {
    if (!text) return "&ZeroWidthSpace;";

    const TOKEN_RE =
        /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;

    let result = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TOKEN_RE.exec(text)) !== null) {
        if (match.index > lastIndex) {
            result += escapeHtml(text.slice(lastIndex, match.index));
        }

        if (match[1]) {
            if (match[2]) {
                result += `<span class="json-key">${escapeHtml(match[1])}</span><span class="json-punct">${escapeHtml(match[2])}</span>`;
            } else {
                result += `<span class="json-string">${escapeHtml(match[1])}</span>`;
            }
        } else if (match[3]) {
            result += `<span class="json-bool">${match[3]}</span>`;
        } else if (match[4]) {
            result += `<span class="json-null">${match[4]}</span>`;
        } else if (match[5]) {
            result += `<span class="json-number">${match[5]}</span>`;
        } else if (match[6]) {
            result += `<span class="json-punct">${escapeHtml(match[6])}</span>`;
        }

        lastIndex = TOKEN_RE.lastIndex;
    }

    if (lastIndex < text.length) {
        result += escapeHtml(text.slice(lastIndex));
    }

    return result;
}

export function RawView(props: RawViewProps) {
    const [wordWrap, setWordWrap] = createSignal(true);

    const formattedText = createMemo(() => formatRawOutput(props.items));
    const lines = createMemo(() => formattedText().split("\n"));
    const itemCount = () => props.items.length;

    const gutterWidth = createMemo(() => {
        const digits = Math.max(String(lines().length).length, 2);
        return `${digits * 8 + 26}px`;
    });

    return (
        <div class="flex-1 flex flex-col overflow-hidden bg-surface">
            {/* Toolbar */}
            <div class="px-3 py-1.5 flex items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-low shrink-0 text-xs flex-wrap">
                <div class="flex items-center gap-2 flex-wrap">
                    {/* Word Wrap Toggle */}
                    <button
                        onClick={() => setWordWrap((w) => !w)}
                        class={`px-2 py-0.5 rounded text-2xs font-medium flex items-center gap-1 cursor-pointer transition-colors border ${
                            wordWrap()
                                ? "bg-surface-variant text-on-surface border-outline"
                                : "text-secondary hover:text-on-surface border-outline-variant"
                        }`}
                        title="Toggle line wrapping"
                    >
                        <span class="i-iconoir-align-left text-xs" />
                        Wrap
                    </button>
                </div>

                {/* Right side stats */}
                <div class="flex items-center gap-2.5">
                    <span class="text-2xs text-secondary/70 font-mono select-none">
                        {itemCount() > 0
                            ? `${itemCount()} item${itemCount() !== 1 ? "s" : ""} · `
                            : ""}
                        {lines().length} line{lines().length !== 1 ? "s" : ""}
                    </span>
                </div>
            </div>

            {/* Code Viewport — Edge-to-edge VS Code Editor Style */}
            <div class="flex-1 overflow-auto bg-surface py-2 select-text">
                <For each={lines()}>
                    {(line, i) => (
                        <div class="flex items-start min-w-fit hover:bg-surface-variant/20 transition-colors group">
                            {/* Gutter Line Number */}
                            <div
                                class="shrink-0 text-right pr-3.5 pl-3 select-none text-secondary/40 group-hover:text-secondary/70 font-mono text-xs cursor-default tabular-nums"
                                style={{
                                    width: gutterWidth(),
                                    "line-height": "20px",
                                    height: "20px",
                                }}
                            >
                                {i() + 1}
                            </div>

                            {/* Line Code */}
                            <div
                                class={`flex-1 min-w-0 pr-4 font-mono text-xs text-on-surface ${
                                    wordWrap() ? "whitespace-pre-wrap break-all" : "whitespace-pre"
                                }`}
                                style={{ "line-height": "20px" }}
                                innerHTML={highlightJsonLine(line)}
                            />
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
}

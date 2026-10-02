import { createEffect, createSignal, For, on, Show } from "solid-js";

import type { RunQueryItem } from "../types.js";
import { ItemValue } from "./ItemValue.js";

const PAGE_SIZE = 50;

export function SequenceView(props: { items: RunQueryItem[] }) {
    const [visibleCount, setVisibleCount] = createSignal(PAGE_SIZE);
    createEffect(
        on(
            () => props.items,
            () => setVisibleCount(PAGE_SIZE),
        ),
    );

    return (
        <div class="flex-1 overflow-auto p-3 sm:p-4">
            <ol class="list-none m-0 p-0 divide-y divide-outline-variant">
                <For each={props.items.slice(0, visibleCount())}>
                    {(item, index) => (
                        <li class="flex items-start gap-3 py-3">
                            <span
                                class="text-2xs leading-5 font-mono text-secondary tabular-nums shrink-0 min-w-6 text-right"
                                title="Sequence position"
                            >
                                {index() + 1}
                            </span>
                            <ItemValue item={item} />
                        </li>
                    )}
                </For>
            </ol>
            <Show when={visibleCount() < props.items.length}>
                <button
                    type="button"
                    class="mt-3 px-3 py-1.5 rounded text-xs bg-surface-container text-on-surface border border-outline-variant cursor-pointer hover:bg-surface-variant"
                    onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                    Show next {Math.min(PAGE_SIZE, props.items.length - visibleCount())} items
                </button>
                <span class="ml-3 text-2xs text-secondary">
                    Showing {Math.min(visibleCount(), props.items.length)} of {props.items.length}
                </span>
            </Show>
        </div>
    );
}

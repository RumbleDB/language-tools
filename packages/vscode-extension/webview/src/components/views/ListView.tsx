import type { Row } from "@tanstack/solid-table";
import { createEffect, For, on, Show } from "solid-js";

import { ItemValue } from "@/components/values/ItemValue.js";
import type { TFeatures } from "@/model/table-features.js";
import type { ResultRowData } from "@/model/types.js";

interface ListViewProps {
    rows: Row<TFeatures, ResultRowData>[];
}

export function ListView(props: ListViewProps) {
    let list!: HTMLDivElement;
    createEffect(
        on(
            () => props.rows,
            () => {
                if (list) list.scrollTop = 0;
            },
        ),
    );

    return (
        <div
            ref={(element) => {
                list = element;
            }}
            class="flex-1 overflow-auto p-3 sm:p-4"
        >
            <Show
                when={props.rows.length > 0}
                fallback={
                    <div class="py-8 text-center text-xs text-secondary font-sans">
                        No matching items found
                    </div>
                }
            >
                <ol class="list-none m-0 p-0 divide-y divide-outline-variant">
                    <For each={props.rows}>
                        {(row) => (
                            <li class="flex items-start gap-3 py-3">
                                <span
                                    class="text-2xs leading-5 font-mono text-secondary tabular-nums shrink-0 min-w-6 text-right"
                                    title="Sequence position"
                                >
                                    {row.original.index + 1}
                                </span>
                                <ItemValue item={row.original.item} />
                            </li>
                        )}
                    </For>
                </ol>
            </Show>
        </div>
    );
}

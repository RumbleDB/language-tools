import type { Row } from "@tanstack/solid-table";
import { createEffect, For, on, Show } from "solid-js";

import { ItemValue } from "@/components/values/ItemValue.js";
import type { TFeatures } from "@/model/table-features.js";
import type { ResultRowData } from "@/model/types.js";

interface ListViewProps {
    rows: Row<TFeatures, ResultRowData>[];
    indexColumnWidth: number;
    reserveArrowSpace: boolean;
    onExpandabilityChange: (id: string, required: boolean) => void;
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
            class="@container flex-1 overflow-auto"
        >
            <Show
                when={props.rows.length > 0}
                fallback={
                    <div class="py-8 text-center text-xs text-secondary font-sans">
                        No matching items found
                    </div>
                }
            >
                <ol class="list-none m-0 p-0 divide-y divide-row-divider">
                    <For each={props.rows}>
                        {(row) => (
                            <li
                                class="grid items-start gap-2 pr-2 py-1.5 hover:bg-row-hover"
                                style={{
                                    "grid-template-columns": `${props.indexColumnWidth}px minmax(0, 1fr)`,
                                }}
                            >
                                <span
                                    class="text-xs leading-5 font-mono text-secondary tabular-nums text-right px-3"
                                    title="Sequence position"
                                >
                                    {row.original.index + 1}
                                </span>
                                <ItemValue
                                    item={row.original.item}
                                    typeLabel="visible"
                                    reserveArrowSpace={props.reserveArrowSpace}
                                    onExpandabilityChange={props.onExpandabilityChange}
                                />
                            </li>
                        )}
                    </For>
                </ol>
            </Show>
        </div>
    );
}

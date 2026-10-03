import { createEffect, createMemo, For, on } from "solid-js";

import type { RunQueryItem } from "../../types.js";
import { createPagination } from "../../utils/pagination.js";
import { PaginationControls } from "../PaginationControls.js";
import { ItemValue } from "../values/ItemValue.js";

export function InspectView(props: { items: RunQueryItem[] }) {
    const pagination = createPagination(() => props.items.length);
    const startIndex = () => pagination.state().pageIndex * pagination.state().pageSize;
    const pageItems = createMemo(() =>
        props.items.slice(startIndex(), startIndex() + pagination.state().pageSize),
    );
    let list!: HTMLDivElement;
    createEffect(on(() => props.items, pagination.reset, { defer: true }));
    createEffect(() => {
        pageItems();
        list.scrollTop = 0;
    });

    return (
        <>
            <div
                ref={(element) => {
                    list = element;
                }}
                class="flex-1 overflow-auto p-3 sm:p-4"
            >
                <ol class="list-none m-0 p-0 divide-y divide-outline-variant">
                    <For each={pageItems()}>
                        {(item, index) => (
                            <li class="flex items-start gap-3 py-3">
                                <span
                                    class="text-2xs leading-5 font-mono text-secondary tabular-nums shrink-0 min-w-6 text-right"
                                    title="Sequence position"
                                >
                                    {startIndex() + index() + 1}
                                </span>
                                <ItemValue item={item} />
                            </li>
                        )}
                    </For>
                </ol>
            </div>
            <PaginationControls
                pageIndex={pagination.state().pageIndex}
                pageCount={pagination.pageCount()}
                pageSize={pagination.state().pageSize}
                canPreviousPage={pagination.canPreviousPage()}
                canNextPage={pagination.canNextPage()}
                onPreviousPage={pagination.previousPage}
                onNextPage={pagination.nextPage}
                onPageSizeChange={pagination.setPageSize}
            />
        </>
    );
}

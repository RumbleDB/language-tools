import type { PaginationState } from "@tanstack/solid-table";
import { createEffect, createSignal } from "solid-js";

/** Shared state and navigation; each view supplies its own matching item count. */
export function createPagination(itemCount: () => number) {
    const [state, setState] = createSignal<PaginationState>({ pageIndex: 0, pageSize: 50 });
    const pageCount = () => Math.max(1, Math.ceil(itemCount() / state().pageSize));
    const setPageIndex = (pageIndex: number) =>
        setState((previous) => ({
            ...previous,
            pageIndex: Math.max(0, Math.min(pageIndex, pageCount() - 1)),
        }));

    createEffect(() => {
        const lastPage = pageCount() - 1;
        setState((previous) =>
            previous.pageIndex > lastPage ? { ...previous, pageIndex: lastPage } : previous,
        );
    });

    return {
        state,
        setState,
        pageCount,
        canPreviousPage: () => state().pageIndex > 0,
        canNextPage: () => state().pageIndex < pageCount() - 1,
        previousPage: () => setPageIndex(state().pageIndex - 1),
        nextPage: () => setPageIndex(state().pageIndex + 1),
        reset: () => setPageIndex(0),
        setPageSize: (pageSize: number) =>
            setState((previous) => ({
                pageSize,
                // Keep the first currently displayed item in view when changing page size.
                pageIndex: Math.min(
                    Math.floor((previous.pageIndex * previous.pageSize) / pageSize),
                    Math.max(0, Math.ceil(itemCount() / pageSize) - 1),
                ),
            })),
    };
}

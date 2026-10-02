import {
    tableFeatures,
    columnFilteringFeature,
    rowSortingFeature,
    globalFilteringFeature,
    rowPaginationFeature,
    columnSizingFeature,
    columnResizingFeature,
    createSortedRowModel,
    createFilteredRowModel,
    createPaginatedRowModel,
} from "@tanstack/solid-table";
import type { Table } from "@tanstack/solid-table";

import type { ResultTableRow } from "../../utils/result-items.js";

export const features = tableFeatures({
    columnFilteringFeature,
    rowSortingFeature,
    globalFilteringFeature,
    rowPaginationFeature,
    columnSizingFeature,
    columnResizingFeature,
    sortedRowModel: createSortedRowModel(),
    filteredRowModel: createFilteredRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
});

export type TFeatures = typeof features;
export type TData = ResultTableRow;
export type ResultsTableInstance = Table<TFeatures, TData>;

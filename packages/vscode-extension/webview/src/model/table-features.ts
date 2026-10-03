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

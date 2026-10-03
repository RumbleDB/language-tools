import type { Table } from "@tanstack/solid-table";
import type { Accessor } from "solid-js";

import type { RunQueryItem } from "@/types.js";
import type { createPagination } from "@/utils/pagination.js";
import type { ResultTableRow, ResultSelection } from "@/utils/result-items.js";

import type { TFeatures } from "./table-features.js";

export interface ResultRowData {
    item: RunQueryItem;
    index: number;
    cells: ResultTableRow;
}

export type TData = ResultRowData;
export type ResultsTableInstance = Table<TFeatures, TData>;

export interface ResultsModel {
    table: ResultsTableInstance;
    pagination: ReturnType<typeof createPagination>;
    globalFilter: Accessor<string>;
    setGlobalFilter: (value: string) => void;
    totalCount: () => number;
    filteredCount: () => number;
    selection: Accessor<ResultSelection>;
}

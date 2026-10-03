import { createTable, type ColumnDef, type SortingState } from "@tanstack/solid-table";
import { createSignal, createMemo, createEffect, on, type Accessor } from "solid-js";

import { CellValue } from "@/components/views/table/CellValue.js";
import type { RunQueryItem } from "@/types.js";
import { itemPreview } from "@/utils/item-presentation.js";
import { createPagination } from "@/utils/pagination.js";
import { formatCell, projectTableRows, type ResultSelection } from "@/utils/result-items.js";

import { features, type TFeatures } from "./table-features.js";
import type { ResultsModel, TData } from "./types.js";

const INDEX_COLUMN: ColumnDef<TFeatures, TData> = {
    id: "__index",
    header: "#",
    enableResizing: false,
    accessorFn: (row: TData) => row.index + 1,
    cell: (info) => (
        <span class="text-secondary font-mono text-xs leading-5 select-none tabular-nums">
            {String(info.getValue())}
        </span>
    ),
};

function getContentWidth(rows: TData[], key: string, header = key): number {
    let length = header.length;
    const samples = Math.min(rows.length, 50);
    for (let sample = 0; sample < samples; sample++) {
        const index = samples === 1 ? 0 : Math.round((sample * (rows.length - 1)) / (samples - 1));
        const items = rows[index]?.cells[key] ?? [];
        if (items.length > 1) length = Math.max(length, `Sequence · ${items.length} items`.length);
        for (const item of items) {
            length = Math.max(length, Math.min(itemPreview(item).length, 121));
        }
    }
    return Math.min(450, Math.max(90, length * 8 + 80));
}

export function createResultsModel(items: Accessor<RunQueryItem[]>): ResultsModel {
    const [globalFilter, setGlobalFilter] = createSignal("");
    const [sorting, setSorting] = createSignal<SortingState>([]);

    const projection = createMemo(() => projectTableRows(items()));
    const columnKeys = () => projection().columns;

    const tableData = createMemo<TData[]>(() => {
        const rawItems = items();
        const rows = projection().rows;
        return rawItems.map((item, index) => ({
            item,
            index,
            cells: rows[index] ?? { value: [item] },
        }));
    });

    const pagination = createPagination(() => table.getPrePaginatedRowModel().rows.length);

    const tableColumns = createMemo<ColumnDef<TFeatures, TData>[]>(() => {
        if (items().length === 0) return [];
        const data = tableData();
        const indexSize = Math.max(36, String(data.length).length * 8 + 24);
        const indexColumn = {
            ...INDEX_COLUMN,
            size: indexSize,
            minSize: indexSize,
            maxSize: indexSize,
        };
        if (projection().objects) {
            return [
                indexColumn,
                ...columnKeys().map((key): ColumnDef<TFeatures, TData> => ({
                    id: `field:${key}`,
                    accessorFn: (row) => formatCell(row.cells[key]),
                    header: key,
                    size: getContentWidth(data, key),
                    cell: (info) => <CellValue items={info.row.original.cells[key]} />,
                })),
            ];
        }
        return [
            indexColumn,
            {
                id: "value",
                accessorFn: (row) => formatCell(row.cells.value),
                header: "Value",
                size: getContentWidth(data, "value", "Value"),
                cell: (info) => <CellValue items={info.row.original.cells.value} />,
            },
        ];
    });

    const globalFilterFn = (
        row: { original: TData },
        _columnId: string,
        filterValue: unknown,
    ): boolean => {
        if (!filterValue || typeof filterValue !== "string") return true;
        const q = filterValue.trim().toLowerCase();
        if (!q) return true;
        if (row.original.item.serialized.toLowerCase().includes(q)) return true;
        for (const val of Object.values(row.original.cells)) {
            if (formatCell(val).toLowerCase().includes(q)) return true;
        }
        return false;
    };

    const table = createTable({
        features,
        get data() {
            return tableData();
        },
        get columns() {
            return tableColumns();
        },
        globalFilterFn,
        columnResizeMode: "onChange",
        defaultColumn: {
            size: 160,
            minSize: 90,
        },
        get state() {
            return {
                sorting: sorting(),
                globalFilter: globalFilter(),
                pagination: pagination.state(),
            };
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: pagination.setState,
    });

    // Reset table state when items change
    createEffect(
        on(
            items,
            () => {
                setGlobalFilter("");
                setSorting([]);
                table.resetColumnSizing(true);
                pagination.reset();
            },
            { defer: true },
        ),
    );

    // Reset pagination to first page when search filter changes
    createEffect(
        on(
            globalFilter,
            () => {
                pagination.reset();
            },
            { defer: true },
        ),
    );

    const selection = createMemo<ResultSelection>(() => {
        const rows = table.getSortedRowModel().rows;
        return {
            items: rows.map((r) => r.original.item),
            rows: rows.map((r) => r.original.cells),
            columns: columnKeys(),
        };
    });

    return {
        table,
        pagination,
        globalFilter,
        setGlobalFilter,
        totalCount: () => tableData().length,
        filteredCount: () => table.getFilteredRowModel().rows.length,
        selection,
    };
}
export type { ResultRowData, ResultsModel, ResultsTableInstance } from "./types.js";

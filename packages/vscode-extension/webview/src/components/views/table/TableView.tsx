import { createTable, type ColumnDef, type SortingState } from "@tanstack/solid-table";
import { createSignal, createMemo, createEffect, on } from "solid-js";

import { PaginationControls } from "@/components/PaginationControls.js";
import type { RunQueryItem } from "@/types.js";
import { itemPreview } from "@/utils/item-presentation.js";
import { createPagination } from "@/utils/pagination.js";
import {
    formatCell,
    projectTableRows,
    selectResultItems,
    type ResultSelection,
} from "@/utils/result-items.js";

import { CellValue } from "./CellValue.js";
import { features, type TFeatures, type TData } from "./model.js";
import { TableGrid } from "./TableGrid.js";

interface TableViewProps {
    items: RunQueryItem[];
    onSelectionChange: (selection: ResultSelection) => void;
}

const INDEX_COLUMN: ColumnDef<TFeatures, TData> = {
    id: "__index",
    header: "#",
    enableResizing: false,
    accessorFn: (_: TData, index: number) => index + 1,
    cell: (info) => (
        <span class="text-secondary/60 font-mono text-xs select-none tabular-nums">
            {String(info.getValue())}
        </span>
    ),
};

/** Estimate initial widths from collapsed previews; TanStack handles subsequent resizing. */
function getContentWidth(rows: TData[], key: string, header = key): number {
    let length = header.length;
    const samples = Math.min(rows.length, 50);
    for (let sample = 0; sample < samples; sample++) {
        const index = samples === 1 ? 0 : Math.round((sample * (rows.length - 1)) / (samples - 1));
        const items = rows[index]![key] ?? [];
        // Sequence members are stacked vertically, so measure the widest preview.
        if (items.length > 1) length = Math.max(length, `Sequence · ${items.length} items`.length);
        for (const item of items) {
            length = Math.max(length, Math.min(itemPreview(item).length, 121));
        }
    }
    // Allow room for padding and cell controls, and wrap especially long values.
    return Math.min(450, Math.max(90, length * 8 + 80));
}

export function TableView(props: TableViewProps) {
    const [globalFilter, setGlobalFilter] = createSignal("");
    const [sorting, setSorting] = createSignal<SortingState>([]);
    const pagination = createPagination(() => table.getPrePaginatedRowModel().rows.length);

    createEffect(
        on(
            () => props.items,
            () => {
                setGlobalFilter("");
                setSorting([]);
                table.resetColumnSizing(true);
                pagination.reset();
            },
            { defer: true },
        ),
    );

    const resultItems = () => props.items;
    const projection = createMemo(() => projectTableRows(resultItems()));
    const tableData = () => projection().rows;
    const columnKeys = () => projection().columns;

    const tableColumns = createMemo<ColumnDef<TFeatures, TData>[]>(() => {
        if (resultItems().length === 0) return [];
        // Digits plus room for the sort indicator.
        const indexSize = Math.max(36, String(tableData().length).length * 8 + 24);
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
                    accessorFn: (row) => formatCell(row[key]),
                    header: key,
                    size: getContentWidth(tableData(), key),
                    cell: (info) => <CellValue items={info.row.original[key]} />,
                })),
            ];
        }
        return [
            indexColumn,
            {
                id: "value",
                accessorFn: (row) => formatCell(row.value),
                header: "Value",
                size: getContentWidth(tableData(), "value", "Value"),
                cell: (info) => <CellValue items={info.row.original.value} />,
            },
        ];
    });

    const table = createTable({
        features,
        get data() {
            return tableData();
        },
        get columns() {
            return tableColumns();
        },
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

    createEffect(() => {
        const rows = table.getSortedRowModel().rows;
        props.onSelectionChange({
            items: selectResultItems(
                props.items,
                rows.map((row) => row.index),
            ),
            rows: rows.map((row) => row.original),
            columns: columnKeys(),
        });
    });

    return (
        <>
            <TableGrid
                table={table}
                totalRows={tableData().length}
                globalFilter={globalFilter()}
                onGlobalFilterChange={setGlobalFilter}
            />
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

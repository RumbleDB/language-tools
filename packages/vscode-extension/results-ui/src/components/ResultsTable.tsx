import {
    createTable,
    type ColumnDef,
    type SortingState,
    type PaginationState,
} from "@tanstack/solid-table";
import { createSignal, createMemo, createEffect, on } from "solid-js";

import type { RunQueryItem } from "../types.js";
import { formatCell, projectTableRows } from "../utils/result-items.js";
import { Footer } from "./Footer.js";
import { SequenceValue } from "./ItemValue.js";
import { TableView } from "./Table.js";
import { features, type TFeatures, type TData } from "./table/model.js";

interface ResultsTableProps {
    items: RunQueryItem[];
}

const INDEX_COLUMN: ColumnDef<TFeatures, TData> = {
    id: "__index",
    header: "#",
    size: 60,
    minSize: 50,
    maxSize: 80,
    accessorFn: (_: TData, index: number) => index + 1,
    cell: (info) => (
        <span class="text-secondary/60 font-mono text-xs select-none tabular-nums">
            {String(info.getValue())}
        </span>
    ),
};

function getDynamicColumnSize(items: TData[], key: string): number {
    const maxLen = Math.max(
        key.length,
        ...items.slice(0, 30).map((item) => formatCell(item[key]).length),
    );
    return Math.min(Math.max(maxLen * 8 + 36, 90), 450);
}

export function ResultsTable(props: ResultsTableProps) {
    const [globalFilter, setGlobalFilter] = createSignal("");
    const [sorting, setSorting] = createSignal<SortingState>([]);
    const [pagination, setPagination] = createSignal<PaginationState>({
        pageIndex: 0,
        pageSize: 50,
    });

    createEffect(
        on(
            () => props.items,
            () => {
                setGlobalFilter("");
                setSorting([]);
                setPagination((previous) => ({ ...previous, pageIndex: 0 }));
            },
            { defer: true },
        ),
    );

    const resultItems = () => props.items;
    const projection = createMemo(() => projectTableRows(resultItems()));
    const tableData = () => projection().rows;

    const tableColumns = createMemo<ColumnDef<TFeatures, TData>[]>(() => {
        if (resultItems().length === 0) return [];
        if (projection().objects) {
            const keys = new Set(tableData().flatMap((row) => Object.keys(row)));
            return [
                INDEX_COLUMN,
                ...Array.from(keys).map((key): ColumnDef<TFeatures, TData> => ({
                    id: `field:${key}`,
                    accessorFn: (row) => formatCell(row[key]),
                    header: key,
                    size: getDynamicColumnSize(tableData(), key),
                    minSize: 80,
                    cell: (info) => (
                        <SequenceValue items={info.row.original[key]} copyable={false} />
                    ),
                })),
            ];
        }
        return [
            INDEX_COLUMN,
            {
                id: "value",
                accessorFn: (row) => formatCell(row.value),
                header: "Value",
                size: 400,
                minSize: 150,
                cell: (info) => <SequenceValue items={info.row.original.value} copyable={false} />,
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
            minSize: 60,
        },
        get state() {
            return {
                sorting: sorting(),
                globalFilter: globalFilter(),
                pagination: pagination(),
            };
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: setPagination,
    });

    return (
        <>
            <TableView
                table={table}
                globalFilter={globalFilter()}
                onGlobalFilterChange={setGlobalFilter}
                totalRows={tableData().length}
            />
            <Footer
                table={table}
                pageSize={pagination().pageSize}
                onPageSizeChange={(size) => table.setPageSize(size)}
            />
        </>
    );
}

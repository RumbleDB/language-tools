interface PaginationControlsProps {
    pageIndex: number;
    pageCount: number;
    pageSize: number;
    canPreviousPage: boolean;
    canNextPage: boolean;
    onPreviousPage: () => void;
    onNextPage: () => void;
    onPageSizeChange: (size: number) => void;
}

export function PaginationControls(props: PaginationControlsProps) {
    return (
        <footer class="bg-surface-container-low border-t border-outline-variant min-h-[32px] py-1 px-3 w-full shrink-0 flex items-center justify-between gap-3 flex-wrap text-xs z-10 box-border">
            <div class="flex items-center gap-1">
                <button
                    aria-label="Previous page"
                    onClick={props.onPreviousPage}
                    disabled={!props.canPreviousPage}
                    class="p-1 hover:bg-surface-variant rounded transition-colors disabled:opacity-30 cursor-pointer flex items-center justify-center text-on-surface"
                >
                    <span class="i-iconoir-nav-arrow-left text-sm" />
                </button>

                <span class="px-1 text-xs text-secondary font-medium">
                    Page {props.pageIndex + 1} of {Math.max(props.pageCount, 1)}
                </span>

                <button
                    aria-label="Next page"
                    onClick={props.onNextPage}
                    disabled={!props.canNextPage}
                    class="p-1 hover:bg-surface-variant rounded transition-colors disabled:opacity-30 cursor-pointer flex items-center justify-center text-on-surface"
                >
                    <span class="i-iconoir-nav-arrow-right text-sm" />
                </button>
            </div>

            <div class="flex items-center gap-1.5 text-secondary">
                <span class="text-2xs">Show:</span>
                <select
                    aria-label="Items per page"
                    value={props.pageSize}
                    onChange={(e) => {
                        const size = Number(e.currentTarget.value);
                        props.onPageSizeChange(size);
                    }}
                    class="bg-transparent border-none p-0 text-2xs font-medium focus:ring-0 cursor-pointer text-on-surface"
                >
                    <option value={20} class="bg-surface text-on-surface">
                        20
                    </option>
                    <option value={50} class="bg-surface text-on-surface">
                        50
                    </option>
                    <option value={100} class="bg-surface text-on-surface">
                        100
                    </option>
                    <option value={250} class="bg-surface text-on-surface">
                        250
                    </option>
                </select>
            </div>
        </footer>
    );
}

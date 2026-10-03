import { createSignal, createEffect } from "solid-js";

interface PaginationControlsProps {
    pageIndex: number;
    pageCount: number;
    pageSize: number;
    canPreviousPage: boolean;
    canNextPage: boolean;
    onPreviousPage: () => void;
    onNextPage: () => void;
    onPageChange: (pageIndex: number) => void;
    onPageSizeChange: (size: number) => void;
}

export function PaginationControls(props: PaginationControlsProps) {
    const totalPages = () => Math.max(props.pageCount, 1);
    const [inputValue, setInputValue] = createSignal(String(props.pageIndex + 1));

    // Keep input field synced with external page changes
    createEffect(() => {
        setInputValue(String(props.pageIndex + 1));
    });

    const commitPage = () => {
        const val = inputValue().trim();
        const parsed = Number.parseInt(val, 10);
        if (!Number.isNaN(parsed)) {
            const clamped = Math.max(1, Math.min(parsed, totalPages()));
            setInputValue(String(clamped));
            props.onPageChange(clamped - 1);
        } else {
            setInputValue(String(props.pageIndex + 1));
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
            commitPage();
            (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
            setInputValue(String(props.pageIndex + 1));
            (e.currentTarget as HTMLInputElement).blur();
        }
    };

    return (
        <footer class="bg-surface-container-low border-t border-outline-variant min-h-[32px] py-1 px-3 w-full shrink-0 flex items-center justify-between gap-3 flex-wrap text-xs z-10 box-border">
            <div class="flex items-center gap-1">
                <button
                    aria-label="First page"
                    title="First page"
                    onClick={() => props.onPageChange(0)}
                    disabled={!props.canPreviousPage}
                    class="p-1 hover:bg-surface-variant rounded transition-colors disabled:opacity-30 cursor-pointer flex items-center justify-center text-on-surface"
                >
                    <span class="i-iconoir-fast-arrow-left text-sm" />
                </button>

                <button
                    aria-label="Previous page"
                    title="Previous page"
                    onClick={props.onPreviousPage}
                    disabled={!props.canPreviousPage}
                    class="p-1 hover:bg-surface-variant rounded transition-colors disabled:opacity-30 cursor-pointer flex items-center justify-center text-on-surface"
                >
                    <span class="i-iconoir-nav-arrow-left text-sm" />
                </button>

                <div class="flex items-center gap-1.5 px-1 text-xs text-secondary font-medium">
                    <span>Page</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-label="Page number"
                        value={inputValue()}
                        onInput={(e) => setInputValue(e.currentTarget.value)}
                        onBlur={commitPage}
                        onKeyDown={handleKeyDown}
                        disabled={totalPages() <= 1}
                        class="w-11 px-1 py-0.5 text-center font-mono text-xs bg-input-bg border border-outline-variant rounded text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors disabled:opacity-50"
                    />
                    <span>of {totalPages()}</span>
                </div>

                <button
                    aria-label="Next page"
                    title="Next page"
                    onClick={props.onNextPage}
                    disabled={!props.canNextPage}
                    class="p-1 hover:bg-surface-variant rounded transition-colors disabled:opacity-30 cursor-pointer flex items-center justify-center text-on-surface"
                >
                    <span class="i-iconoir-nav-arrow-right text-sm" />
                </button>

                <button
                    aria-label="Last page"
                    title="Last page"
                    onClick={() => props.onPageChange(totalPages() - 1)}
                    disabled={!props.canNextPage}
                    class="p-1 hover:bg-surface-variant rounded transition-colors disabled:opacity-30 cursor-pointer flex items-center justify-center text-on-surface"
                >
                    <span class="i-iconoir-fast-arrow-right text-sm" />
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

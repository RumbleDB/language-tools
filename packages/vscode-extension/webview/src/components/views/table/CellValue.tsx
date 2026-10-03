import { Show } from "solid-js";

import { SequenceValue } from "@/components/values/ItemValue.js";
import type { RunQueryItem } from "@/types.js";
import { createCopyAction } from "@/utils/clipboard.js";
import { formatCell } from "@/utils/result-items.js";

export function CellValue(props: { items: RunQueryItem[] | undefined }) {
    const { copy, copied } = createCopyAction();
    return (
        <div class="flex items-start gap-1 min-w-0 group">
            <div class="flex-1 min-w-0">
                <SequenceValue items={props.items} copyable={false} reserveArrowSpace={false} />
            </div>
            <Show when={props.items !== undefined}>
                <button
                    type="button"
                    class="w-5 h-5 flex items-center justify-center shrink-0 text-secondary hover:text-on-surface rounded cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
                    aria-label={copied() ? "Cell copied" : "Copy cell"}
                    title={copied() ? "Cell copied" : "Copy cell"}
                    disabled={props.items?.some((item) => item.serialized === null)}
                    onClick={() => copy(formatCell(props.items))}
                >
                    <span class={copied() ? "i-iconoir-check text-success" : "i-iconoir-copy"} />
                </button>
            </Show>
        </div>
    );
}

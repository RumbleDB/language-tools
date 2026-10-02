import { createMemo, createSignal, For, Show } from "solid-js";

import type { RunQueryItem } from "../types.js";
import { createCopyAction } from "../utils/clipboard.js";
import { isExpandable, itemPreview, itemTone } from "../utils/item-presentation.js";
import { formatItem } from "../utils/result-items.js";
import { XmlSource } from "./XmlSource.js";

interface ItemValueProps {
    item: RunQueryItem;
    copyable?: boolean;
}

export function ItemValue(props: ItemValueProps) {
    const [expanded, setExpanded] = createSignal(false);
    const { copy, copied } = createCopyAction();
    const expandable = createMemo(() => isExpandable(props.item));
    const preview = createMemo(() => itemPreview(props.item));
    const tone = () => `result-value-${itemTone(props.item)}`;

    return (
        <div class="min-w-0 w-full">
            <div class="flex items-start gap-1 min-w-0">
                <Show when={expandable()} fallback={<span class="w-5 h-5 shrink-0" />}>
                    <button
                        type="button"
                        class="w-5 h-5 flex items-center justify-center shrink-0 text-secondary hover:text-on-surface rounded cursor-pointer"
                        aria-expanded={expanded()}
                        aria-label={`${expanded() ? "Collapse" : "Expand"} value`}
                        onClick={() => setExpanded((value) => !value)}
                    >
                        <span
                            class={
                                expanded()
                                    ? "i-iconoir-nav-arrow-down"
                                    : "i-iconoir-nav-arrow-right"
                            }
                        />
                    </button>
                </Show>
                <span
                    class={`font-mono text-xs leading-5 flex-1 min-w-0 break-words ${tone()}`}
                    title={props.item.type}
                >
                    {preview().length > 120 ? `${preview().slice(0, 120)}…` : preview()}
                </span>
                <Show when={props.copyable !== false}>
                    <button
                        type="button"
                        class="w-5 h-5 flex items-center justify-center shrink-0 text-secondary hover:text-on-surface rounded cursor-pointer disabled:opacity-30"
                        title={copied() ? "Copied" : "Copy value"}
                        aria-label={copied() ? "Copied" : "Copy value"}
                        disabled={props.item.serialized === null}
                        onClick={() => copy(formatItem(props.item))}
                    >
                        <span
                            class={copied() ? "i-iconoir-check text-success" : "i-iconoir-copy"}
                        />
                    </button>
                </Show>
            </div>
            <Show when={expanded() && expandable()}>
                <div class="ml-2 pl-3 mt-2 border-l border-outline-variant space-y-2">
                    <div class="text-2xs text-secondary break-words" title={props.item.typeName}>
                        {props.item.nodeKind && props.item.nodeKind !== props.item.type
                            ? `${props.item.nodeKind} · `
                            : ""}
                        {props.item.type}
                    </div>
                    <Show when={props.item.entries}>
                        <For each={props.item.entries}>
                            {(entry) => (
                                <div class="space-y-1">
                                    <div
                                        class={`font-mono text-xs result-value-${itemTone(entry.key)} break-words`}
                                        title={entry.key.type}
                                    >
                                        {itemPreview(entry.key)}:
                                    </div>
                                    <div class="pl-2">
                                        <SequenceValue
                                            items={entry.value}
                                            copyable={props.copyable}
                                        />
                                    </div>
                                </div>
                            )}
                        </For>
                    </Show>
                    <Show when={props.item.members}>
                        <For each={props.item.members}>
                            {(member, index) => (
                                <div class="flex items-start gap-2 min-w-0">
                                    <span class="font-mono text-2xs leading-5 text-secondary shrink-0">
                                        [{index() + 1}]
                                    </span>
                                    <SequenceValue items={member} copyable={props.copyable} />
                                </div>
                            )}
                        </For>
                    </Show>
                    <Show when={props.item.function}>
                        <pre class="text-xs font-mono whitespace-pre-wrap break-words text-on-surface">
                            {props.item.function?.signature}
                        </pre>
                    </Show>
                    <Show when={!props.item.entries && !props.item.members && !props.item.function}>
                        <Show
                            when={props.item.kind === "node"}
                            fallback={
                                <pre
                                    class={`text-xs font-mono whitespace-pre-wrap break-words ${tone()}`}
                                >
                                    {formatItem(props.item)}
                                </pre>
                            }
                        >
                            <XmlSource source={formatItem(props.item)} />
                        </Show>
                    </Show>
                    <Show when={props.item.serializationError}>
                        <p class="text-xs text-error">{props.item.serializationError}</p>
                    </Show>
                </div>
            </Show>
        </div>
    );
}

/** Keeps sequence-valued entries/members distinct from a single array item. */
export function SequenceValue(props: { items: RunQueryItem[] | undefined; copyable?: boolean }) {
    return (
        <Show
            when={props.items !== undefined}
            fallback={
                <span
                    class="text-secondary/50 italic font-mono text-xs leading-5"
                    title="Missing field"
                >
                    —
                </span>
            }
        >
            <Show
                when={props.items!.length > 0}
                fallback={
                    <span
                        class="text-secondary/50 italic font-mono text-xs leading-5"
                        title="Empty sequence"
                    >
                        ()
                    </span>
                }
            >
                <div class="min-w-0 flex-1 space-y-1">
                    <Show when={props.items!.length > 1}>
                        <div class="text-2xs leading-5 text-secondary">
                            Sequence · {props.items!.length} items
                        </div>
                    </Show>
                    <For each={props.items}>
                        {(item, index) => (
                            <div class="flex items-start gap-2 min-w-0">
                                <Show when={props.items!.length > 1}>
                                    <span class="text-2xs leading-5 text-secondary font-mono shrink-0">
                                        {index() + 1}.
                                    </span>
                                </Show>
                                <ItemValue item={item} copyable={props.copyable} />
                            </div>
                        )}
                    </For>
                </div>
            </Show>
        </Show>
    );
}

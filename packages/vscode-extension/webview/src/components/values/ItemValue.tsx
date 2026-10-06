import {
    createEffect,
    createMemo,
    createSignal,
    createUniqueId,
    For,
    on,
    onCleanup,
    onMount,
    Show,
} from "solid-js";

import type { RunQueryItem } from "@/types.js";
import { createCopyAction } from "@/utils/clipboard.js";
import { isExpandable, itemPreviewParts } from "@/utils/item-presentation.js";

import { ItemPreview } from "./ItemPreview.js";
import { SourceTokens } from "./SourceTokens.js";

/** Nested values reveal their type on hover to keep expanded structures readable. */
type TypeLabel = "visible" | "hover";

interface ItemValueProps {
    item: RunQueryItem;
    copyable?: boolean;
    /** Show the item's type after the preview; requires an `@container` ancestor. */
    typeLabel?: TypeLabel;
    reserveArrowSpace?: boolean;
    onExpandabilityChange?: (id: string, required: boolean) => void;
}

export function ItemValue(props: ItemValueProps) {
    const [expanded, setExpanded] = createSignal(false);
    const itemId = createUniqueId();
    const { copy, copied } = createCopyAction();
    const nestedTypeLabel = () => (props.typeLabel ? "hover" : undefined);
    let previewElement!: HTMLSpanElement;
    const [previewClipped, setPreviewClipped] = createSignal(false);
    const parts = createMemo(() => itemPreviewParts(props.item));
    const preview = createMemo(() =>
        parts()
            .map((part) => part.content)
            .join(""),
    );
    const expandable = createMemo(
        () =>
            isExpandable(props.item) || parts().some((part) => part.truncated) || previewClipped(),
    );
    createEffect(() => props.onExpandabilityChange?.(itemId, expandable() || expanded()));
    onCleanup(() => props.onExpandabilityChange?.(itemId, false));

    // A short value can still need expansion when the panel or a nested field is narrow.
    const measurePreview = () => {
        if (previewElement) {
            setPreviewClipped(
                Boolean(
                    previewElement.scrollHeight > previewElement.clientHeight ||
                    previewElement.scrollWidth > previewElement.clientWidth,
                ),
            );
        }
    };
    createEffect(on(preview, () => queueMicrotask(measurePreview)));
    onMount(() => {
        let measurementFrame: number | undefined;
        const observer = new ResizeObserver(() => {
            if (measurementFrame !== undefined) return;
            measurementFrame = requestAnimationFrame(() => {
                measurementFrame = undefined;
                measurePreview();
            });
        });
        observer.observe(previewElement);
        onCleanup(() => {
            observer.disconnect();
            if (measurementFrame !== undefined) cancelAnimationFrame(measurementFrame);
        });
    });

    return (
        <div class="min-w-0 w-full">
            <div class="group flex items-start gap-1 min-w-0">
                <Show
                    when={expandable() || expanded()}
                    fallback={
                        <Show when={props.reserveArrowSpace !== false}>
                            <span class="w-5 h-5 shrink-0" />
                        </Show>
                    }
                >
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
                    ref={(element) => {
                        previewElement = element;
                    }}
                    class="font-mono text-xs leading-5 flex-1 min-w-0 break-words line-clamp-2 result-value-value"
                    title={props.item.type.displayName}
                >
                    <ItemPreview parts={parts()} />
                </span>
                <Show when={props.typeLabel}>
                    <span
                        class="hidden @xs:block shrink-0 max-w-[30%] ml-1 font-mono text-xs leading-5 text-secondary truncate select-none"
                        classList={{
                            "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100":
                                props.typeLabel === "hover",
                        }}
                        title={props.item.type.displayName}
                    >
                        {props.item.type.displayName}
                    </span>
                </Show>
                <Show when={props.copyable !== false}>
                    <button
                        type="button"
                        class={`w-5 h-5 flex items-center justify-center shrink-0 text-secondary hover:text-on-surface hover:bg-action-hover rounded cursor-pointer focus-visible:outline-1 focus-visible:outline-focus group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 ${copied() ? "opacity-100" : "opacity-0"}`}
                        title={copied() ? "Copied" : "Copy value"}
                        aria-label={copied() ? "Copied" : "Copy value"}
                        onClick={() => copy(props.item.serialized)}
                    >
                        <span
                            class={copied() ? "i-iconoir-check text-success" : "i-iconoir-copy"}
                        />
                    </button>
                </Show>
            </div>
            <Show when={expanded()}>
                <div class="ml-2 pl-3 mt-2 border-l border-outline-variant space-y-2">
                    <Show when={props.item.kind === "object" && props.item}>
                        {(item) => (
                            <For each={item().fields}>
                                {(field) => (
                                    <div class="flex items-start gap-2 min-w-0">
                                        <div class="font-mono text-xs leading-5 shrink-0 max-w-[40%] result-value-key break-words">
                                            {JSON.stringify(field.name)}:
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <SequenceValue
                                                items={field.value}
                                                copyable={props.copyable}
                                                typeLabel={nestedTypeLabel()}
                                                reserveArrowSpace={false}
                                            />
                                        </div>
                                    </div>
                                )}
                            </For>
                        )}
                    </Show>
                    <Show when={props.item.kind === "map" && props.item}>
                        {(item) => (
                            <For each={item().entries}>
                                {(entry) => (
                                    <div class="flex items-start gap-2 min-w-0">
                                        <div
                                            class="font-mono text-xs leading-5 shrink-0 max-w-[40%] result-value-value break-words"
                                            title={entry.key.type.displayName}
                                        >
                                            <SourceTokens source={entry.key.serialized} />:
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <SequenceValue
                                                items={entry.value}
                                                copyable={props.copyable}
                                                typeLabel={nestedTypeLabel()}
                                                reserveArrowSpace={false}
                                            />
                                        </div>
                                    </div>
                                )}
                            </For>
                        )}
                    </Show>
                    <Show when={props.item.kind === "array" && props.item}>
                        {(item) => (
                            <For each={item().members}>
                                {(member, index) => (
                                    <div class="flex items-start gap-2 min-w-0">
                                        <span class="font-mono leading-5 text-secondary shrink-0">
                                            [{index() + 1}]
                                        </span>
                                        <SequenceValue
                                            items={member}
                                            copyable={props.copyable}
                                            typeLabel={nestedTypeLabel()}
                                        />
                                    </div>
                                )}
                            </For>
                        )}
                    </Show>
                    <Show
                        when={
                            props.item.kind !== "object" &&
                            props.item.kind !== "map" &&
                            props.item.kind !== "array"
                        }
                    >
                        <pre
                            class={`text-xs font-mono whitespace-pre-wrap break-words result-value-value`}
                        >
                            <SourceTokens
                                language={props.item.kind === "node" ? "xml" : "xquery"}
                                source={
                                    props.item.kind === "function"
                                        ? props.item.signature
                                        : props.item.serialized
                                }
                            />
                        </pre>
                    </Show>
                </div>
            </Show>
        </div>
    );
}

/** Keeps sequence-valued entries/members distinct from a single array item. */
export function SequenceValue(props: {
    items: RunQueryItem[] | undefined;
    copyable?: boolean;
    typeLabel?: TypeLabel;
    reserveArrowSpace?: boolean;
    onExpandabilityChange?: (id: string, required: boolean) => void;
}) {
    return (
        <Show
            when={props.items !== undefined}
            fallback={
                <span
                    class="text-secondary/50 italic font-mono text-xs leading-5"
                    classList={{ "pl-6": props.reserveArrowSpace !== false }}
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
                        class="result-value-null font-mono text-xs leading-5"
                        classList={{ "pl-6": props.reserveArrowSpace !== false }}
                        title="Empty sequence"
                    >
                        ()
                    </span>
                }
            >
                <div class="min-w-0 flex-1 space-y-1">
                    <Show when={props.items!.length > 1}>
                        <div class="leading-5 text-secondary">
                            Sequence · {props.items!.length} items
                        </div>
                    </Show>
                    <For each={props.items}>
                        {(item, index) => (
                            <div class="flex items-start gap-2 min-w-0">
                                <Show when={props.items!.length > 1}>
                                    <span class="leading-5 text-secondary font-mono shrink-0">
                                        {index() + 1}.
                                    </span>
                                </Show>
                                <ItemValue
                                    item={item}
                                    copyable={props.copyable}
                                    typeLabel={props.typeLabel}
                                    reserveArrowSpace={props.reserveArrowSpace}
                                    onExpandabilityChange={props.onExpandabilityChange}
                                />
                            </div>
                        )}
                    </For>
                </div>
            </Show>
        </Show>
    );
}

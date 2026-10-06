import { Show } from "solid-js";

/** Column name with the engine-computed type of its values underneath, when known. */
export function ColumnHeader(props: { name: string; type: string | undefined }) {
    return (
        <div class="flex flex-col min-w-0">
            <span class="truncate" title={props.name}>
                {props.name}
            </span>
            <Show when={props.type}>
                {(type) => (
                    <span
                        class="font-mono font-normal tracking-normal text-secondary truncate"
                        title={type()}
                    >
                        {type()}
                    </span>
                )}
            </Show>
        </div>
    );
}

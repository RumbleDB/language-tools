/** Column name with the summarized sequence type of its values underneath. */
export function ColumnHeader(props: { name: string; type: string }) {
    return (
        <div class="flex flex-col min-w-0">
            <span class="truncate" title={props.name}>
                {props.name}
            </span>
            <span
                class="font-mono font-normal tracking-normal text-secondary truncate"
                title={props.type}
            >
                {props.type}
            </span>
        </div>
    );
}

interface RawViewProps {
    output: string;
}

export function RawView(props: RawViewProps) {
    return (
        <div class="flex-1 overflow-auto p-4 bg-surface-container-lowest max-w-full">
            <pre class="bg-surface border border-outline-variant rounded p-4 font-mono text-xs whitespace-pre-wrap break-all wrap-anywhere text-on-surface max-w-full overflow-x-auto m-0">
                {props.output}
            </pre>
        </div>
    );
}

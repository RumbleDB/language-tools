interface RawViewProps {
    output: string;
}

export function RawView(props: RawViewProps) {
    return (
        <div class="flex-1 overflow-auto p-4 bg-surface-container-lowest">
            <div class="bg-surface border border-outline-variant rounded p-4 font-code text-xs whitespace-pre-wrap text-on-surface">
                {props.output}
            </div>
        </div>
    );
}

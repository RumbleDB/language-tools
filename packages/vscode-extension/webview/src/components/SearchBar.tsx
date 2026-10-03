import { Show } from "solid-js";

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export function SearchBar(props: SearchBarProps) {
    return (
        <div class="relative w-full max-w-xs sm:max-w-md">
            <span class="i-iconoir-search absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm" />
            <input
                type="text"
                value={props.value}
                onInput={(e) => props.onChange(e.currentTarget.value)}
                placeholder={props.placeholder ?? "Filter results..."}
                class="w-full pl-9 pr-8 py-1 bg-input-bg border border-outline-variant rounded text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-input-placeholder text-on-surface"
            />
            <Show when={props.value}>
                <button
                    onClick={() => props.onChange("")}
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface p-0.5 rounded cursor-pointer transition-colors"
                    title="Clear filter"
                >
                    <span class="i-iconoir-xmark text-xs" />
                </button>
            </Show>
        </div>
    );
}

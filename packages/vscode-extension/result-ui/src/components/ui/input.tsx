import { type ComponentProps, splitProps } from "solid-js";

import { cn } from "../../lib/utils.js";

export interface InputProps extends ComponentProps<"input"> {}

export function Input(props: InputProps) {
    const [local, rest] = splitProps(props, ["class", "type"]);
    return (
        <input
            type={local.type}
            class={cn(
                "flex h-7 w-full rounded-md border border-vscode-inputBorder bg-vscode-inputBg px-3 py-1 text-xs text-vscode-inputFg placeholder:text-vscode-inputPlaceholder shadow-xs transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focus disabled:cursor-not-allowed disabled:opacity-50",
                local.class,
            )}
            {...rest}
        />
    );
}

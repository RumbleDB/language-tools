import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps, splitProps } from "solid-js";

import { cn } from "../../lib/utils.js";

export const buttonVariants = cva(
    "inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focus disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
    {
        variants: {
            variant: {
                default:
                    "bg-vscode-buttonBg text-vscode-buttonFg hover:bg-vscode-buttonHover shadow-xs",
                secondary:
                    "bg-vscode-buttonSecBg text-vscode-buttonSecFg hover:bg-vscode-buttonSecHover border border-vscode-border",
                outline:
                    "border border-vscode-border bg-transparent hover:bg-vscode-hover text-vscode-fg",
                ghost: "hover:bg-vscode-hover text-vscode-fg",
                destructive:
                    "bg-vscode-errorBg text-vscode-errorFg border border-vscode-errorBorder hover:bg-vscode-errorBg/80",
            },
            size: {
                default: "h-8 px-3 py-1",
                sm: "h-7 px-2.5 text-[11px]",
                lg: "h-9 px-4 text-sm",
                icon: "h-7 w-7",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

export interface ButtonProps
    extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {}

export function Button(props: ButtonProps) {
    const [local, rest] = splitProps(props, ["class", "variant", "size"]);
    return (
        <button
            class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
            {...rest}
        />
    );
}

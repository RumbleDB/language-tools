import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps, splitProps } from "solid-js";

import { cn } from "../../lib/utils.js";

export const badgeVariants = cva(
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-vscode-focus uppercase tracking-wider",
    {
        variants: {
            variant: {
                default: "border-transparent bg-vscode-buttonBg text-vscode-buttonFg",
                secondary: "border-vscode-border bg-vscode-card text-vscode-fg",
                success: "border-vscode-successFg/30 bg-vscode-successFg/10 text-vscode-successFg",
                destructive: "border-vscode-errorBorder bg-vscode-errorBg text-vscode-errorFg",
                outline: "border-vscode-border text-vscode-fg",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
);

export interface BadgeProps extends ComponentProps<"div">, VariantProps<typeof badgeVariants> {}

export function Badge(props: BadgeProps) {
    const [local, rest] = splitProps(props, ["class", "variant"]);
    return <div class={cn(badgeVariants({ variant: local.variant }), local.class)} {...rest} />;
}

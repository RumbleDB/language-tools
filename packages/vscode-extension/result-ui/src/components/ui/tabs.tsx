import { Tabs as TabsPrimitive } from "@kobalte/core/tabs";
import { type ComponentProps, splitProps } from "solid-js";

import { cn } from "../../lib/utils.js";

export const Tabs = TabsPrimitive;

export function TabsList(props: ComponentProps<typeof TabsPrimitive.List>) {
    const [local, rest] = splitProps(props, ["class"]);
    return (
        <TabsPrimitive.List
            class={cn(
                "inline-flex h-7 items-center justify-center rounded-md bg-vscode-card p-0.5 text-vscode-muted border border-vscode-border",
                local.class,
            )}
            {...rest}
        />
    );
}

export function TabsTrigger(props: ComponentProps<typeof TabsPrimitive.Trigger>) {
    const [local, rest] = splitProps(props, ["class"]);
    return (
        <TabsPrimitive.Trigger
            class={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded px-2.5 py-0.5 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focus disabled:pointer-events-none disabled:opacity-50 data-[selected]:bg-vscode-buttonBg data-[selected]:text-vscode-buttonFg data-[selected]:shadow-xs cursor-pointer",
                local.class,
            )}
            {...rest}
        />
    );
}

export function TabsContent(props: ComponentProps<typeof TabsPrimitive.Content>) {
    const [local, rest] = splitProps(props, ["class"]);
    return (
        <TabsPrimitive.Content
            class={cn(
                "mt-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focus",
                local.class,
            )}
            {...rest}
        />
    );
}

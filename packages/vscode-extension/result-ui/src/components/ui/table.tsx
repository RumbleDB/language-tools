import { type ComponentProps, splitProps } from "solid-js";

import { cn } from "../../lib/utils.js";

export function Table(props: ComponentProps<"table">) {
    const [local, rest] = splitProps(props, ["class"]);
    return (
        <div class="relative w-full overflow-auto rounded-md border border-vscode-border bg-vscode-card">
            <table
                class={cn("w-full caption-bottom text-xs text-left border-collapse", local.class)}
                {...rest}
            />
        </div>
    );
}

export function TableHeader(props: ComponentProps<"thead">) {
    const [local, rest] = splitProps(props, ["class"]);
    return (
        <thead
            class={cn(
                "bg-vscode-header sticky top-0 z-10 border-b border-vscode-border",
                local.class,
            )}
            {...rest}
        />
    );
}

export function TableBody(props: ComponentProps<"tbody">) {
    const [local, rest] = splitProps(props, ["class"]);
    return <tbody class={cn("[&_tr:last-child]:border-0", local.class)} {...rest} />;
}

export function TableRow(props: ComponentProps<"tr">) {
    const [local, rest] = splitProps(props, ["class"]);
    return (
        <tr
            class={cn(
                "border-b border-vscode-border/30 transition-colors hover:bg-vscode-hover data-[state=selected]:bg-vscode-hover",
                local.class,
            )}
            {...rest}
        />
    );
}

export function TableHead(props: ComponentProps<"th">) {
    const [local, rest] = splitProps(props, ["class"]);
    return (
        <th
            class={cn(
                "h-8 px-3 text-left align-middle font-semibold text-[11px] uppercase tracking-wider text-vscode-muted border-r border-vscode-border/30 last:border-r-0 select-none",
                local.class,
            )}
            {...rest}
        />
    );
}

export function TableCell(props: ComponentProps<"td">) {
    const [local, rest] = splitProps(props, ["class"]);
    return (
        <td
            class={cn(
                "p-2.5 align-top font-mono text-[11px] border-r border-vscode-border/20 last:border-r-0 whitespace-pre-wrap",
                local.class,
            )}
            {...rest}
        />
    );
}

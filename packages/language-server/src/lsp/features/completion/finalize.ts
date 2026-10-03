import type { CompletionItem } from "vscode-languageserver";

export function finalizeCompletionItems(items: CompletionItem[]): CompletionItem[] {
    return [...items]
        .sort((left, right) =>
            (left.sortText ?? `1:${left.label}`).localeCompare(
                right.sortText ?? `1:${right.label}`,
            ),
        )
        .map((item, index) => ({
            ...item,
            sortText: `${index.toString().padStart(5, "0")}:${item.label}`,
        }));
}

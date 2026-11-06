import type { CompletionItem } from "vscode-languageserver";

import { createItemEditor, type EditContext } from "./edit.js";

export function finalizeCompletionItems(
    items: CompletionItem[],
    context: EditContext,
    insertReplaceSupport: boolean,
): CompletionItem[] {
    const toEdit = createItemEditor(context, insertReplaceSupport);

    return [...items]
        .sort((left, right) =>
            (left.sortText ?? `1:${left.label}`).localeCompare(
                right.sortText ?? `1:${right.label}`,
            ),
        )
        .map((item, index) => ({
            ...item,
            sortText: `${index.toString().padStart(5, "0")}:${item.label}`,
            textEdit: toEdit(item),
        }));
}

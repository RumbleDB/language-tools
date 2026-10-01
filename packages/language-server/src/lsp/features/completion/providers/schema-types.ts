import { CompletionItemKind, type CompletionItem } from "vscode-languageserver";

import { applyQNamePrefixFilter, getQNameCompletionLabels } from "../context.js";
import type { CompletionProvider } from "../types.js";

export const provideSchemaTypeCompletions: CompletionProvider = async (context) => {
    if (!context.intent.allowTypes) return null;

    const { namespaces } = await context.getAnalysis();
    const items: CompletionItem[] = [];
    for (const definition of await context.getVisibleDeclarations()) {
        if (definition.kind !== "type" || definition.origin !== "schema") continue;
        for (const label of getQNameCompletionLabels(definition.name, namespaces)) {
            items.push({
                label,
                kind: CompletionItemKind.Class,
                detail: "XML Schema type",
                insertText: label,
            });
        }
    }
    return applyQNamePrefixFilter(items, context) ?? items;
};

import { formatSequenceType } from "server/analysis/index.js";
import { CompletionItemKind, InsertTextFormat, type CompletionItem } from "vscode-languageserver";

import { applyQNamePrefixFilter, getQNameCompletionLabels } from "../context.js";
import type { CompletionProvider } from "../types.js";
import { createFunctionCallSnippet } from "./snippets.js";

export const provideSchemaConstructorCompletions: CompletionProvider = async (context) => {
    if (!context.intent.allowFunctions) return null;

    const analysis = await context.getAnalysis();
    const namespaces = analysis.namespaces;

    const items: CompletionItem[] = [];
    for (const definition of await context.getVisibleDeclarations()) {
        if (definition.kind !== "function" || definition.origin !== "schema") continue;
        for (const label of getQNameCompletionLabels(definition.name.qname, namespaces)) {
            items.push({
                label,
                kind: CompletionItemKind.Function,
                detail: `${label}(${definition.signature.parameterTypes.map((parameter) => formatSequenceType(parameter.type)).join(", ")}) as ${formatSequenceType(definition.signature.returnType)}`,
                insertText: createFunctionCallSnippet(label, ["$value"]),
                insertTextFormat: InsertTextFormat.Snippet,
            });
        }
    }
    return applyQNamePrefixFilter(items, context) ?? items;
};

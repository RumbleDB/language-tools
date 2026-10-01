import {
    DEFAULT_NAMESPACES,
    formatSequenceType,
    getDefinitions,
    QNameToString,
} from "server/analysis/index.js";
import { CompletionItemKind, InsertTextFormat, type CompletionItem } from "vscode-languageserver";

import { applyQNamePrefixFilter } from "../context.js";
import type { CompletionProvider } from "../types.js";
import { createFunctionCallSnippet } from "./snippets.js";

export const provideSchemaConstructorCompletions: CompletionProvider = async (context) => {
    if (!context.intent.allowFunctions) return null;

    const analysis = await context.getAnalysis();
    const namespaces = new Map(DEFAULT_NAMESPACES);
    for (const definition of getDefinitions(analysis.ast)) {
        if (definition.kind === "namespace") {
            namespaces.set(definition.name.prefix, definition.namespaceUri);
        }
    }

    const items: CompletionItem[] = [];
    for (const definition of await context.getVisibleDeclarations()) {
        if (definition.kind !== "function" || definition.origin !== "implicit") continue;
        const qname = definition.name.qname;
        // Catalog names have no query prefix. Offer each alias bound to their namespace.
        const prefixes = [...namespaces].filter(([, uri]) => uri === qname.namespaceUri);
        const labels =
            prefixes.length === 0
                ? [QNameToString(qname, true)]
                : prefixes.map(([prefix]) => QNameToString({ ...qname, prefix }, false));
        for (const label of labels) {
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

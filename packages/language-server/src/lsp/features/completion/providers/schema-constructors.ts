import { formatSequenceType } from "server/analysis/index.js";
import { CompletionItemKind } from "vscode-languageserver";

import { applyQNamePrefixFilter, getQNameCompletionLabels } from "../context.js";
import type { CompletionProvider, ProvidedCompletionItem } from "../types.js";
import { functionCallInsertion } from "./snippets.js";

export const provideSchemaConstructorCompletions: CompletionProvider = async (context) => {
    if (!context.intent.allowFunctions) return null;

    const analysis = await context.getAnalysis();
    const { namespaces, defaultFunctionNamespace } = analysis;

    const items: ProvidedCompletionItem[] = [];
    for (const definition of await context.getVisibleDeclarations()) {
        if (definition.kind !== "function" || definition.origin !== "schema") continue;
        const signatureSuffix = `(${definition.signature.parameterTypes.map((parameter) => formatSequenceType(parameter.type)).join(", ")}) as ${formatSequenceType(definition.signature.returnType)}`;
        for (const label of getQNameCompletionLabels(
            definition.name.qname,
            namespaces,
            defaultFunctionNamespace,
        )) {
            items.push({
                label,
                kind: CompletionItemKind.Function,
                labelDetails: { detail: signatureSuffix },
                detail: `${label}${signatureSuffix}`,
                ...functionCallInsertion(label, ["$value"]),
            });
        }
    }
    return applyQNamePrefixFilter(items, context) ?? items;
};

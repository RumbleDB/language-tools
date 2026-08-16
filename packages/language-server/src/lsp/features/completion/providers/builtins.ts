import { defaultNamespaces } from "server/analysis/default-namespaces.js";
import { QNameToString } from "server/analysis/names.js";
import { formatSequenceType } from "server/analysis/type-system.js";
import {
    builtinFunctions,
    type BuiltinFunctionDefinition,
} from "server/resources/builtin-functions.js";
import { builtinTypes } from "server/resources/builtin-types.js";
import {
    docs,
    formatFunctionDocEntry,
    getBuiltinFunctionDocumentation,
    type Signature,
} from "server/resources/function-docs.js";
import {
    CompletionItemKind,
    InsertTextFormat,
    MarkupKind,
    type CompletionItem,
} from "vscode-languageserver";

import type { CompletionProvider } from "../types.js";
import { createFunctionCallSnippet } from "./snippets.js";

const GENERIC_BUILTIN_PARAMETER_PREFIX = "$arg";
const BUILTIN_FUNCTION_COMPLETION_ITEMS = createBuiltinFunctionCompletionItems();
const BUILTIN_TYPE_COMPLETION_ITEMS = createBuiltinTypeCompletionItems();

export const provideBuiltinFunctionCompletions: CompletionProvider = (context) =>
    context.intent.allowFunctions ? BUILTIN_FUNCTION_COMPLETION_ITEMS : null;

export const provideBuiltinTypeCompletions: CompletionProvider = (context) =>
    context.intent.allowTypes ? BUILTIN_TYPE_COMPLETION_ITEMS : null;

function createBuiltinFunctionCompletionItems(): CompletionItem[] {
    const itemsByName = new Map<string, { item: CompletionItem; parameterCount: number }>();

    for (const definition of builtinFunctions.all) {
        const { qname, arity } = definition.name;
        const functionName = QNameToString(qname, false);
        const ns = qname.namespaceUri ?? defaultNamespaces.get(qname.prefix || "fn");
        const docsKey = QNameToString(
            {
                localName: qname.localName,
                ...(ns === undefined ? {} : { namespaceUri: ns }),
            },
            true,
        );
        const docEntry = docs[docsKey];
        const overloadCount = docEntry?.signatures.length;
        const parameterNames = getBuiltinCompletionParameterNames(definition, docEntry?.signatures);
        const parameterTypes = definition.signature.parameterTypes
            .map((parameter) => formatSequenceType(parameter.type))
            .join(", ");
        const signature = `${functionName}(${parameterTypes}) as ${formatSequenceType(definition.signature.returnType)}`;
        const documentation = getBuiltinFunctionDocumentation(definition.name.qname);
        const item: CompletionItem = {
            label: functionName,
            kind: CompletionItemKind.Function,
            insertText: createFunctionCallSnippet(functionName, parameterNames),
            insertTextFormat: InsertTextFormat.Snippet,
            detail:
                overloadCount !== undefined && overloadCount > 1
                    ? `${functionName}(...) • ${overloadCount} overloads`
                    : arity === undefined
                      ? signature
                      : `${signature} / ${arity}`,
            documentation: {
                kind: MarkupKind.Markdown,
                value:
                    documentation === undefined
                        ? "No documentation available."
                        : formatFunctionDocEntry(documentation, arity),
            },
        };

        const existing = itemsByName.get(functionName);
        if (existing === undefined || parameterNames.length < existing.parameterCount) {
            itemsByName.set(functionName, {
                item,
                parameterCount: parameterNames.length,
            });
        }
    }

    return [...itemsByName.values()].map(({ item }) => item);
}

function createBuiltinTypeCompletionItems(): CompletionItem[] {
    return builtinTypes.all.map((definition) => {
        const label = QNameToString(definition.name, false);
        const expandedName = QNameToString(definition.name, true);

        return {
            label,
            kind: CompletionItemKind.Class,
            detail: "Builtin JSONiq type",
            documentation: {
                kind: MarkupKind.Markdown,
                value: `\`\`\`jsoniq\n${expandedName}\n\`\`\``,
            },
        } satisfies CompletionItem;
    });
}

function getBuiltinCompletionParameterNames(
    definition: BuiltinFunctionDefinition,
    signatures: Signature[] | undefined,
): string[] {
    const preferredSignature = signatures?.reduce((best, current) =>
        current.params.length < best.params.length ? current : best,
    );
    if (preferredSignature !== undefined) {
        return preferredSignature.params.map((parameter) => `$${parameter.name}`);
    }

    return definition.signature.parameterTypes.map(
        (_parameter, index) => `${GENERIC_BUILTIN_PARAMETER_PREFIX}${index + 1}`,
    );
}

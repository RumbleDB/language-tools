import {
    DEFAULT_NAMESPACES,
    formatSequenceType,
    QNameToString,
    BuiltinFunctionDefinition,
} from "server/analysis/index.js";
import { getActiveParserId } from "server/parser/utils.js";
import { builtinFunctions } from "server/resources/builtin-functions.js";
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

import { applyQNamePrefixFilter, getQNameCompletionLabels } from "../context.js";
import type { CompletionProvider } from "../types.js";
import { createFunctionCallSnippet } from "./snippets.js";

const GENERIC_BUILTIN_PARAMETER_PREFIX = "$arg";
const BUILTIN_FUNCTION_COMPLETION_ITEMS = {
    jsoniq: createBuiltinFunctionCompletionItems("jsoniq"),
    xquery: createBuiltinFunctionCompletionItems("xquery"),
};
const BUILTIN_TYPE_COMPLETION_ITEMS = createBuiltinTypeCompletionItems();

export const provideBuiltinFunctionCompletions: CompletionProvider = async (context) => {
    if (!context.intent.allowFunctions) {
        return null;
    }

    const language = getActiveParserId(context.document) ?? "jsoniq";
    const { namespaces, defaultFunctionNamespace } = await context.getAnalysis();
    const items =
        defaultFunctionNamespace === undefined
            ? BUILTIN_FUNCTION_COMPLETION_ITEMS[language]
            : createBuiltinFunctionCompletionItems(language, namespaces, defaultFunctionNamespace);

    // When the user has typed a namespace prefix (e.g. `fn:`), filter items to that
    // prefix and supply an explicit textEdit that replaces the whole typed prefix so
    // the editor does not produce duplicate prefixes (e.g. `fn:fn:string-join`).
    return applyQNamePrefixFilter(items, context) ?? items;
};

export const provideBuiltinTypeCompletions: CompletionProvider = (context) => {
    if (!context.intent.allowTypes) {
        return null;
    }

    return (
        applyQNamePrefixFilter(BUILTIN_TYPE_COMPLETION_ITEMS, context) ??
        BUILTIN_TYPE_COMPLETION_ITEMS
    );
};

function createBuiltinFunctionCompletionItems(
    language: "jsoniq" | "xquery",
    namespaces: ReadonlyMap<string, string> = DEFAULT_NAMESPACES,
    defaultFunctionNamespace?: string,
): CompletionItem[] {
    const itemsByName = new Map<string, { item: CompletionItem; parameterCount: number }>();

    for (const definition of builtinFunctions.forLanguage(language)) {
        const { qname, arity } = definition.name;
        const labels =
            defaultFunctionNamespace === undefined
                ? [QNameToString(qname, false)]
                : getQNameCompletionLabels(qname, namespaces, defaultFunctionNamespace);
        for (const functionName of labels) {
            const ns = qname.namespaceUri ?? DEFAULT_NAMESPACES.get(qname.prefix || "fn");
            const docsKey = QNameToString(
                {
                    localName: qname.localName,
                    ...(ns === undefined ? {} : { namespaceUri: ns }),
                },
                true,
            );
            const docEntry = docs[docsKey];
            const overloadCount = docEntry?.signatures.length;
            const parameterNames = getBuiltinCompletionParameterNames(
                definition,
                docEntry?.signatures,
            );
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

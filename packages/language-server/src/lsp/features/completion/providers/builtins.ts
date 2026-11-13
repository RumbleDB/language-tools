import {
    DEFAULT_NAMESPACES,
    formatSequenceType,
    QNameToString,
    BuiltinFunctionDefinition,
    type QName,
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
import { createCallSnippetFor } from "./snippets.js";

const GENERIC_BUILTIN_PARAMETER_PREFIX = "$arg";
/** The name a documented signature gives its open-ended last parameter, as in `concat($arg1, $arg2, ...)`. */
const VARIADIC_PARAMETER_NAME = "...";
const BUILTIN_FUNCTION_COMPLETION_ITEMS = {
    jsoniq: {
        call: createBuiltinFunctionCompletionItems("jsoniq", false),
        arrow: createBuiltinFunctionCompletionItems("jsoniq", true),
    },
    xquery: {
        call: createBuiltinFunctionCompletionItems("xquery", false),
        arrow: createBuiltinFunctionCompletionItems("xquery", true),
    },
};
const BUILTIN_TYPE_COMPLETION_ITEMS = createBuiltinTypeCompletionItems();

/** What resolving a builtin function item needs to give it its documentation. */
interface BuiltinFunctionItemData {
    builtinFunction: { qname: QName; arity: number | undefined };
}

export const provideBuiltinFunctionCompletions: CompletionProvider = async (context) => {
    if (!context.intent.allowFunctions) {
        return null;
    }

    const language = getActiveParserId(context.document) ?? "jsoniq";
    const arrow = context.intent.arrowFunction === true;
    const { namespaces, defaultFunctionNamespace } = await context.getAnalysis();
    const items =
        defaultFunctionNamespace === undefined
            ? BUILTIN_FUNCTION_COMPLETION_ITEMS[language][arrow ? "arrow" : "call"]
            : createBuiltinFunctionCompletionItems(
                  language,
                  arrow,
                  namespaces,
                  defaultFunctionNamespace,
              );

    // When the user has typed a namespace prefix (e.g. `fn:`), only offer items with that prefix.
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

/** Gives a builtin function item the documentation that was left out of the completion list. */
export function resolveBuiltinFunctionCompletion(item: CompletionItem): CompletionItem | undefined {
    if (!isBuiltinFunctionItemData(item.data)) {
        return undefined;
    }
    const { qname, arity } = item.data.builtinFunction;
    const documentation = getBuiltinFunctionDocumentation(qname);
    return {
        ...item,
        documentation: {
            kind: MarkupKind.Markdown,
            value:
                documentation === undefined
                    ? "No documentation available."
                    : formatFunctionDocEntry(documentation, arity),
        },
    };
}

function isBuiltinFunctionItemData(data: unknown): data is BuiltinFunctionItemData {
    return typeof data === "object" && data !== null && "builtinFunction" in data;
}

/**
 * One item per function name, for its overload with the fewest parameters. After `=>` the
 * expression before the arrow fills the first parameter, so an overload without parameters is
 * left out and the call leaves that parameter out.
 */
function createBuiltinFunctionCompletionItems(
    language: "jsoniq" | "xquery",
    arrow: boolean,
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
            const insertText = createCallSnippetFor(functionName, parameterNames, arrow);
            if (insertText === null) {
                continue;
            }
            const parameterTypes = definition.signature.parameterTypes
                .map((parameter) => formatSequenceType(parameter.type))
                .join(", ");
            const signatureSuffix = `(${parameterTypes}) as ${formatSequenceType(definition.signature.returnType)}`;
            const signature = `${functionName}${signatureSuffix}`;
            const data: BuiltinFunctionItemData = { builtinFunction: { qname, arity } };
            const item: CompletionItem = {
                label: functionName,
                kind: CompletionItemKind.Function,
                labelDetails: { detail: signatureSuffix },
                insertText,
                insertTextFormat: InsertTextFormat.Snippet,
                detail:
                    overloadCount !== undefined && overloadCount > 1
                        ? `${signature} • ${overloadCount} overloads`
                        : arity === undefined
                          ? signature
                          : `${signature} / ${arity}`,
                // Documented when resolved, since the list has hundreds of builtins.
                data,
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
            labelDetails: { description: "Builtin type" },
            documentation: {
                kind: MarkupKind.Markdown,
                value: `\`\`\`jsoniq\n${expandedName}\n\`\`\``,
            },
        } satisfies CompletionItem;
    });
}

/**
 * The parameter names of one overload, as its documented signature of the same arity names them.
 * A variadic signature such as `concat($arg1, $arg2, ...)` names its first parameters, and the
 * rest are numbered, so the call has exactly as many placeholders as the overload has parameters.
 */
function getBuiltinCompletionParameterNames(
    definition: BuiltinFunctionDefinition,
    signatures: Signature[] | undefined,
): string[] {
    const arity = definition.signature.parameterTypes.length;
    const documented =
        signatures?.find((signature) => signature.params.length === arity) ??
        signatures?.find((signature) => signature.params.at(-1)?.name === VARIADIC_PARAMETER_NAME);
    const names =
        documented?.params
            .filter((parameter) => parameter.name !== VARIADIC_PARAMETER_NAME)
            .map((parameter) => `$${parameter.name}`) ?? [];

    return Array.from(
        { length: arity },
        (_parameter, index) => names[index] ?? `${GENERIC_BUILTIN_PARAMETER_PREFIX}${index + 1}`,
    );
}

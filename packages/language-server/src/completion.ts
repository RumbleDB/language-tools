import {
    CompletionItemKind,
    InsertTextFormat,
    MarkupKind,
    TextEdit,
    type CompletionItem,
    type Position,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { defaultNamespaces } from "./analysis/default-namespaces.js";
import {
    BaseDefinition,
    definitionNameToString,
    isSourceFunctionDefinition,
    isSourceParameterDefinition,
    isSourceVariableDefinition,
} from "./analysis/definitions.js";
import { QNameToString } from "./analysis/names.js";
import { getVisibleDeclarationsAtPosition } from "./analysis/queries.js";
import { BuiltinFunctionDefinition, builtinFunctions } from "./assets/builtin-functions.js";
import {
    docs,
    formatFunctionDocEntry,
    getBuiltinFunctionDocumentation,
    Signature,
} from "./assets/function-docs.js";
import { collectCompletionIntent } from "./parser/index.js";
import { getDocumentText } from "./parser/utils.js";

const VARIABLE_PREFIX_PATTERN = /\$[A-Za-z0-9_.:-]*$/;
const GENERIC_BUILTIN_PARAMETER_PREFIX = "$arg";

export function findCompletions(document: TextDocument, position: Position): CompletionItem[] {
    const source = getDocumentText(document);
    const cursorOffset = document.offsetAt(position);
    const intent = collectCompletionIntent(document, cursorOffset);

    if (intent === null) {
        return [];
    }

    // Find the prefix of the variable or name being typed, if any.
    // This is used to determine whether to offer variable or name completions, and to limit the completion suggestions to those matching the prefix.
    const variablePrefix =
        source.slice(0, cursorOffset).match(VARIABLE_PREFIX_PATTERN)?.[0] ?? null;
    const typingVariablePrefix = variablePrefix !== null;

    // If we have already typed part of a variable name, we want to replace that prefix with the completion,
    // This is to avoid inserting the completion after the prefix, which would result in an invalid variable name
    const variableReplaceRange =
        variablePrefix === null
            ? null
            : {
                  start: document.positionAt(cursorOffset - variablePrefix.length),
                  end: position,
              };

    const availableSourceDeclarations = getVisibleDeclarationsAtPosition(document, position);
    const variables = intent.allowVariableReferences
        ? availableSourceDeclarations.filter(
              (v) => isSourceVariableDefinition(v) || isSourceParameterDefinition(v),
          )
        : [];
    const functions = intent.allowFunctions
        ? availableSourceDeclarations.filter(isSourceFunctionDefinition)
        : [];
    const builtinFunctions = intent.allowFunctions ? getBuiltinFunctionCompletionItems() : [];
    const keywords = keywordCompletions(intent.keywords);

    if (intent.allowVariableDeclarations && !typingVariablePrefix) {
        return [
            {
                label: "$",
                kind: CompletionItemKind.Keyword,
                detail: "Start a variable declaration",
            },
        ];
    }

    return withSortText([
        ...variables.map((v) => {
            const name = definitionNameToString(v);
            return {
                ...toCompletionItem(v),
                ...(variableReplaceRange !== null
                    ? { textEdit: TextEdit.replace(variableReplaceRange, name) }
                    : {}),
            };
        }),
        ...functions.map(toCompletionItem),
        ...builtinFunctions,
        ...keywords,
    ]);
}

function toCompletionItem(declaration: BaseDefinition): CompletionItem {
    const name = definitionNameToString(declaration);
    if (isSourceFunctionDefinition(declaration)) {
        const label = QNameToString(declaration.name.qname, false);
        const parameterNames = declaration.parameters.map((parameter) =>
            definitionNameToString(parameter),
        );
        const signature = `${label}(${parameterNames.join(", ")})`;

        return {
            label,
            kind: CompletionItemKind.Function,
            detail: signature,
            insertText: createFunctionCallSnippet(label, parameterNames),
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
                kind: MarkupKind.Markdown,
                value: [
                    "```jsoniq",
                    signature,
                    "```",
                    `declared at line ${declaration.selectionRange.start.line + 1}`,
                ].join("\n"),
            },
        };
    }

    return {
        label: name,
        kind: CompletionItemKind.Variable,
        detail: `JSONiq ${declaration.kind}`,
    };
}

function getBuiltinFunctionCompletionItems(): CompletionItem[] {
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
            .map((parameter) => parameter.type)
            .join(", ");
        const signature = `${functionName}(${parameterTypes}) as ${definition.signature.returnType}`;
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
                value: getBuiltinFunctionDocumentation(definition.name.qname)
                    ? formatFunctionDocEntry(
                          getBuiltinFunctionDocumentation(definition.name.qname)!,
                          arity,
                      )
                    : "No documentation available.",
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

function keywordCompletions(
    keywords: Array<{ label: string; insertText?: string }>,
): CompletionItem[] {
    return keywords.map((completion) => ({
        label: completion.label,
        ...(completion.insertText === undefined ? {} : { insertText: completion.insertText }),
        kind: CompletionItemKind.Keyword,
        detail: "JSONiq keyword",
    }));
}

function withSortText(items: CompletionItem[]): CompletionItem[] {
    return items
        .sort((left, right) => left.label.localeCompare(right.label))
        .map((item, index) => ({
            ...item,
            sortText: `${index.toString().padStart(5, "0")}:${item.label}`,
        }));
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

function createFunctionCallSnippet(functionName: string, parameterNames: string[]): string {
    const placeholders = parameterNames.map(
        (parameterName, index) => `\${${index + 1}:${escapeSnippetText(parameterName)}}`,
    );
    return `${functionName}(${placeholders.join(", ")})$0`;
}

function escapeSnippetText(text: string): string {
    return text.replaceAll("\\", "\\\\").replaceAll("$", "\\$").replaceAll("}", "\\}");
}

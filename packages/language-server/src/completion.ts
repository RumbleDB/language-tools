import {
    CompletionItemKind,
    MarkupKind,
    TextEdit,
    type CompletionItem,
    type Position,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    BaseDefinition,
    definitionNameToString,
    isSourceFunctionDefinition,
    isSourceParameterDefinition,
    isSourceVariableDefinition,
} from "./analysis/definitions.js";
import { QNameToString } from "./analysis/names.js";
import { getVisibleDeclarationsAtPosition } from "./analysis/queries.js";
import { getBuiltinFunctionDocumentation } from "./function-catalog/index.js";
import { getW3Catalog } from "./function-catalog/loader.js";
import { collectCompletionIntent } from "./parser/index.js";
import { getDocumentText } from "./parser/utils.js";
import { getBuiltinFunctions } from "./wrapper/builtin-functions.js";

const VARIABLE_PREFIX_PATTERN = /\$[A-Za-z0-9_.:-]*$/;

export async function findCompletions(
    document: TextDocument,
    position: Position,
): Promise<CompletionItem[]> {
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

    const availableSourceDeclarations = await getVisibleDeclarationsAtPosition(document, position);
    const variables = intent.allowVariableReferences
        ? availableSourceDeclarations.filter(
              (v) => isSourceVariableDefinition(v) || isSourceParameterDefinition(v),
          )
        : [];
    const functions = intent.allowFunctions
        ? availableSourceDeclarations.filter(isSourceFunctionDefinition)
        : [];
    const builtinFunctions = intent.allowFunctions ? await getBuiltinFunctionCompletionItems() : [];
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
        const label = QNameToString(declaration.name.qname);
        const signature = `${label}(${declaration.parameters
            .map((parameter) => definitionNameToString(parameter))
            .join(", ")})`;

        return {
            label,
            kind: CompletionItemKind.Function,
            detail: signature,
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

async function getBuiltinFunctionCompletionItems(): Promise<CompletionItem[]> {
    const itemsByName = new Map<string, CompletionItem>();
    const catalog = getW3Catalog();

    for (const definition of (await getBuiltinFunctions()).all) {
        const { qname, arity } = definition.name;
        const functionName = QNameToString(qname);
        const catalogKey = `${qname.prefix || "fn"}:${qname.localName}`;
        const overloadCount = catalog[catalogKey]?.signatures.length;
        const parameterTypes = definition.signature.parameterTypes
            .map((parameter) => parameter.type)
            .join(", ");
        const signature = `${functionName}(${parameterTypes}) as ${definition.signature.returnType}`;
        const item: CompletionItem = {
            label: functionName,
            kind: CompletionItemKind.Function,
            detail:
                overloadCount !== undefined && overloadCount > 1
                    ? `${functionName}(...) • ${overloadCount} overloads`
                    : arity === undefined
                      ? signature
                      : `${signature} / ${arity}`,
            documentation: {
                kind: MarkupKind.Markdown,
                value: getBuiltinFunctionDocumentation(definition, {
                    preferMatchingArity: false,
                }),
            },
        };

        const existing = itemsByName.get(functionName);
        if (existing === undefined) {
            itemsByName.set(functionName, item);
        }
    }

    return [...itemsByName.values()];
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

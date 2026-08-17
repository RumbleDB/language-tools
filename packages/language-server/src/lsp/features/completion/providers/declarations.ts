import {
    definitionNameToString,
    QNameToString,
    type ScopeDefinition,
} from "server/analysis/index.js";
import {
    CompletionItemKind,
    InsertTextFormat,
    MarkupKind,
    type CompletionItem,
} from "vscode-languageserver";

import { replaceTypedPrefix, typedPrefix } from "../context.js";
import type { CompletionProvider } from "../types.js";
import { createFunctionCallSnippet } from "./snippets.js";

const VARIABLE_PREFIX_PATTERN = /\$[A-Za-z0-9_.:-]*$/;

export const provideVariableCompletions: CompletionProvider = (context) => {
    if (!context.intent.allowVariableReferences) {
        return null;
    }

    const variablePrefix = typedPrefix(
        context.source,
        context.cursorOffset,
        VARIABLE_PREFIX_PATTERN,
    );

    return context
        .getVisibleDeclarations()
        .filter((definition) => definition.kind === "variable" || definition.kind === "parameter")
        .map((definition) => {
            const name = definitionNameToString(definition);
            return {
                ...toCompletionItem(definition),
                ...(variablePrefix === null
                    ? {}
                    : {
                          textEdit: replaceTypedPrefix(
                              context.document,
                              context.cursorOffset,
                              variablePrefix,
                              name,
                          ),
                      }),
            };
        });
};

export const provideSourceFunctionCompletions: CompletionProvider = (context) => {
    if (!context.intent.allowFunctions) {
        return null;
    }

    return context
        .getVisibleDeclarations()
        .filter((definition) => definition.kind === "function")
        .map(toCompletionItem);
};

export const provideSourceTypeCompletions: CompletionProvider = (context) => {
    if (!context.intent.allowTypes) {
        return null;
    }

    return context
        .getVisibleDeclarations()
        .filter((definition) => definition.kind === "type")
        .map(toCompletionItem);
};

function toCompletionItem(declaration: ScopeDefinition): CompletionItem {
    const name = definitionNameToString(declaration);
    if (declaration.origin === "source" && declaration.kind === "function") {
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

    if (declaration.origin === "source" && declaration.kind === "type") {
        const label = QNameToString(declaration.name, false);
        const expandedName = QNameToString(declaration.name, true);

        return {
            label,
            kind: CompletionItemKind.Class,
            detail: "JSONiq schema type",
            documentation: {
                kind: MarkupKind.Markdown,
                value: [
                    "```jsoniq",
                    expandedName,
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

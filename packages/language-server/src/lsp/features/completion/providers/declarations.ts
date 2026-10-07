import {
    definitionNameToString,
    getVisibleDeclarationsAtPosition,
    QNameToString,
    type ScopeDefinition,
} from "server/analysis/index.js";
import { CONTEXT_ITEM_NAME } from "server/parser/types/name.js";
import { getActiveParserId } from "server/parser/utils.js";
import {
    CompletionItemKind,
    InsertTextFormat,
    MarkupKind,
    type CompletionItem,
} from "vscode-languageserver";

import {
    replaceTypedPrefix,
    typedPrefix,
    applyQNamePrefixFilter,
    getQNameCompletionLabels,
} from "../context.js";
import type { CompletionProvider } from "../types.js";
import { createFunctionCallSnippet } from "./snippets.js";

const VARIABLE_PREFIX_PATTERN = /\$[A-Za-z0-9_.:-]*$/;

export const provideVariableCompletions: CompletionProvider = async (context) => {
    if (!context.intent.allowVariableReferences) {
        return null;
    }

    const variablePrefix = typedPrefix(
        context.source,
        context.cursorOffset,
        VARIABLE_PREFIX_PATTERN,
    );

    // Resolve at the reference's start, just like normal variable resolution.
    // The cursor can equal a recovered initializer's end and incorrectly
    // include the variable being initialized in completion suggestions.
    const declarations =
        variablePrefix === null
            ? await context.getVisibleDeclarations()
            : getVisibleDeclarationsAtPosition(
                  await context.getAnalysis(),
                  context.cursorOffset - variablePrefix.length,
              );

    // XQuery writes the context item as `.`, not as a variable.
    const offerContextItem = getActiveParserId(context.document) !== "xquery";

    return declarations
        .filter((definition) => definition.kind === "variable" || definition.kind === "parameter")
        .filter((definition) => offerContextItem || !isContextItem(definition))
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

export const provideSourceFunctionCompletions: CompletionProvider = async (context) => {
    if (!context.intent.allowFunctions) {
        return null;
    }

    const { namespaces, defaultFunctionNamespace } = await context.getAnalysis();
    const items = (await context.getVisibleDeclarations())
        .filter((definition) => definition.kind === "function" && definition.origin === "source")
        .flatMap((definition) =>
            getQNameCompletionLabels(
                definition.name.qname,
                namespaces,
                defaultFunctionNamespace,
            ).map((label) => toCompletionItem(definition, label)),
        );

    return applyQNamePrefixFilter(items, context) ?? items;
};

export const provideSourceTypeCompletions: CompletionProvider = async (context) => {
    if (!context.intent.allowTypes) {
        return null;
    }

    const items = (await context.getVisibleDeclarations())
        .filter((definition) => definition.kind === "type" && definition.origin === "source")
        .map((definition) => toCompletionItem(definition));

    return applyQNamePrefixFilter(items, context) ?? items;
};

function toCompletionItem(declaration: ScopeDefinition, functionLabel?: string): CompletionItem {
    const name = definitionNameToString(declaration);
    if (declaration.origin === "source" && declaration.kind === "function") {
        const label = functionLabel ?? QNameToString(declaration.name.qname, false);
        const parameterNames = declaration.parameters.map((parameter) =>
            definitionNameToString(parameter),
        );
        const signatureSuffix = `(${parameterNames.join(", ")})`;
        const signature = `${label}${signatureSuffix}`;

        return {
            label,
            kind: CompletionItemKind.Function,
            labelDetails: { detail: signatureSuffix },
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
            labelDetails: { description: "Schema type" },
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
        labelDetails: {
            description: isContextItem(declaration)
                ? "Context item"
                : declaration.kind.charAt(0).toUpperCase() + declaration.kind.slice(1),
        },
    };
}

function isContextItem(declaration: ScopeDefinition): boolean {
    return (
        declaration.kind === "variable" &&
        declaration.name.localName === CONTEXT_ITEM_NAME.localName
    );
}

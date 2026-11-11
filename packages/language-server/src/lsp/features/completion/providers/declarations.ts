import {
    definitionNameToString,
    getVisibleDeclarationsAtPosition,
    isContextItem,
    parameterListToString,
    QNameToString,
    type ScopeDefinition,
} from "server/analysis/index.js";
import { getActiveParserId } from "server/parser/utils.js";
import {
    CompletionItemKind,
    InsertTextFormat,
    MarkupKind,
    type CompletionItem,
} from "vscode-languageserver";

import {
    referenceStart,
    applyQNamePrefixFilter,
    getQNameCompletionLabels,
    lookupDotAtCursor,
} from "../context.js";
import type { CompletionProvider } from "../types.js";
import { createFunctionCallSnippet } from "./snippets.js";

export const provideVariableCompletions: CompletionProvider = async (context) => {
    // A field name is far more likely after a lookup dot. A variable, as in `$o.$key`, still follows a typed `$`.
    if (!context.intent.allowVariableReferences || lookupDotAtCursor(context) !== undefined) {
        return null;
    }

    const start = referenceStart(context.getParseResult().tokens, context.cursorOffset);
    const isAfterDollar = context.source[start] === "$";

    // Resolve at the reference's start, just like normal variable resolution.
    // The cursor can equal a recovered initializer's end and incorrectly
    // include the variable being initialized in completion suggestions.
    const declarations = isAfterDollar
        ? getVisibleDeclarationsAtPosition(await context.getAnalysis(), start)
        : await context.getVisibleDeclarations();

    // XQuery writes the context item as `.`, not as a variable.
    const offerContextItem = getActiveParserId(context.document) !== "xquery";

    return declarations
        .filter((definition) => definition.kind === "variable" || definition.kind === "parameter")
        .filter((definition) => offerContextItem || !isContextItem(definition))
        .map((definition) => toCompletionItem(definition));
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
        const signatureSuffix = parameterListToString(declaration);
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

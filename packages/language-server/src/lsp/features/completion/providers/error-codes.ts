import { errorCodes, formatErrorCodeDocumentation } from "server/resources/error-codes.js";
import { CompletionItemKind, MarkupKind, type CompletionItem } from "vscode-languageserver";

import { replaceRange } from "../context.js";
import type { CompletionProvider } from "../types.js";

const CATCH_ERROR_TARGET_PREFIX_PATTERN =
    /(?:\*|[A-Za-z_][A-Za-z0-9_.-]*)(?::(?:\*|[A-Za-z_][A-Za-z0-9_.-]*)?)?$/;

export const provideErrorCodeCompletions: CompletionProvider = (context) => {
    const targetPrefix =
        context.source
            .slice(0, context.cursorOffset)
            .match(CATCH_ERROR_TARGET_PREFIX_PATTERN)?.[0] ?? "";
    // A target is only expected where it starts: a wildcard being typed is not itself followed by one.
    if (!context.getIntentAt(context.cursorOffset - targetPrefix.length)?.allowErrorCodeTargets) {
        return null;
    }

    return [...wildcardErrorCodeCompletions(), ...errorCodeCompletions(targetPrefix)]
        .filter((item) => item.label.startsWith(targetPrefix))
        .map((item) => ({
            ...item,
            textEdit: replaceRange(
                context.document,
                context.cursorOffset - targetPrefix.length,
                context.cursorOffset,
                item.label,
            ),
        }));
};

function errorCodeCompletions(targetPrefix: string): CompletionItem[] {
    return Object.values(errorCodes).map((entry) => ({
        label: formatErrorCodeLabel(entry.code, targetPrefix),
        kind: CompletionItemKind.Value,
        detail: `${entry.category} error code`,
        documentation: {
            kind: MarkupKind.Markdown,
            value: formatErrorCodeDocumentation(entry),
        },
        labelDetails: {
            description: entry.description,
        },
    }));
}

function formatErrorCodeLabel(code: string, targetPrefix: string): string {
    const localName = code.slice("err:".length);
    return targetPrefix.startsWith("*:") ? `*:${localName}` : code;
}

function wildcardErrorCodeCompletions(): CompletionItem[] {
    return [
        {
            label: "*",
            kind: CompletionItemKind.Value,
            detail: "Catch any error",
            labelDetails: {
                description: "Wildcard error code",
            },
        },
        {
            label: "err:*",
            kind: CompletionItemKind.Value,
            detail: "Catch any W3C XPath/XQuery error",
        },
    ];
}

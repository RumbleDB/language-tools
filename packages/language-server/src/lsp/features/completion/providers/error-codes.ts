import { errorCodes, formatErrorCodeDocumentation } from "server/resources/error-codes.js";
import { CompletionItemKind, MarkupKind, type CompletionItem } from "vscode-languageserver";

import { replaceTypedPrefix, typedPrefix } from "../context.js";
import type { CompletionProvider } from "../types.js";

const CATCH_ERROR_TARGET_PREFIX_PATTERN =
    /(?:\*|[A-Za-z_][A-Za-z0-9_.-]*)(?::(?:\*|[A-Za-z_][A-Za-z0-9_.-]*)?)?$/;
const CATCH_ERROR_TARGET_CONTEXT_PATTERN =
    /\bcatch\s+(?:(?:\*|[A-Za-z_][A-Za-z0-9_.-]*)(?::(?:\*|[A-Za-z_][A-Za-z0-9_.-]*)?)?(?:\s*\|\s*(?:\*|[A-Za-z_][A-Za-z0-9_.-]*)(?::(?:\*|[A-Za-z_][A-Za-z0-9_.-]*)?)?)*)?$/;

export const provideErrorCodeCompletions: CompletionProvider = (context) => {
    if (
        !context.intent.allowErrorCodeTargets &&
        !CATCH_ERROR_TARGET_CONTEXT_PATTERN.test(context.source.slice(0, context.cursorOffset))
    ) {
        return null;
    }

    const targetPrefix =
        typedPrefix(context.source, context.cursorOffset, CATCH_ERROR_TARGET_PREFIX_PATTERN) ?? "";

    return [...wildcardErrorCodeCompletions(), ...errorCodeCompletions(targetPrefix)]
        .filter((item) => item.label.startsWith(targetPrefix))
        .map((item) => ({
            ...item,
            textEdit: replaceTypedPrefix(
                context.document,
                context.cursorOffset,
                targetPrefix,
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
    if (targetPrefix.startsWith("err:")) {
        return code;
    }
    if (targetPrefix.startsWith("*:")) {
        return `*:${localName}`;
    }
    return code;
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

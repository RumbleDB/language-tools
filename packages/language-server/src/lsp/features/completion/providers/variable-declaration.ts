import { CompletionItemKind } from "vscode-languageserver";

import { typedPrefix } from "../context.js";
import type { CompletionProvider } from "../types.js";

const VARIABLE_PREFIX_PATTERN = /\$[A-Za-z0-9_.:-]*$/;

export const provideVariableDeclarationCompletions: CompletionProvider = (context) => {
    const variablePrefix = typedPrefix(
        context.source,
        context.cursorOffset,
        VARIABLE_PREFIX_PATTERN,
    );

    if (!context.intent.allowVariableDeclarations || variablePrefix !== null) {
        return null;
    }

    return [
        {
            label: "$",
            kind: CompletionItemKind.Keyword,
            detail: "Start a variable declaration",
        },
    ];
};

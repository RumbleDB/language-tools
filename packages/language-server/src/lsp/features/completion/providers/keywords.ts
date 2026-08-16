import { CompletionItemKind } from "vscode-languageserver";

import type { CompletionProvider } from "../types.js";

export const provideKeywordCompletions: CompletionProvider = (context) =>
    context.intent.keywords.map((completion) => ({
        label: completion.label,
        ...(completion.insertText === undefined ? {} : { insertText: completion.insertText }),
        kind: CompletionItemKind.Keyword,
        detail: "JSONiq keyword",
    }));

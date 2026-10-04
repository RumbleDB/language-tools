import { CompletionItemKind } from "vscode-languageserver";

import type { CompletionProvider } from "../types.js";

const CONTINUATIONS = [
    "then",
    "else",
    "satisfies",
    "in",
    "by",
    "of",
    "as",
    "catch",
    "case",
    "default",
    "start",
    "when",
    "end",
    "only end",
];
const FLWOR_CLAUSES = ["return", "where", "let", "group by", "order by", "for", "count"];
const SORT_DIRECTIONS = ["ascending", "descending"];
const WORD_OPERATORS = new Set([
    "and",
    "or",
    "to",
    "div",
    "idiv",
    "mod",
    "eq",
    "ne",
    "lt",
    "le",
    "gt",
    "ge",
    "is",
    "union",
    "intersect",
    "except",
    "instance of",
    "cast as",
    "castable as",
    "treat as",
]);
const LITERAL_VALUES = new Set(["true", "false", "null"]);
const OPTIONAL_KEYWORDS = new Set([
    ...WORD_OPERATORS,
    "ordered",
    "unordered",
    "validate",
    "stable order by",
    "empty",
    "collation",
    "allowing empty",
]);

export const provideKeywordCompletions: CompletionProvider = (context) => {
    const labels = new Set(context.intent.keywords.map((completion) => completion.label));
    // Sorting directions apply to the current clause; return/where start the next one.
    const preferred = [
        ...CONTINUATIONS,
        ...(labels.has("ascending") ? SORT_DIRECTIONS : []),
        ...(labels.has("return") ? FLWOR_CLAUSES : []),
    ];

    return context.intent.keywords.map((completion) => {
        const classification = classifyKeyword(completion.label);
        return {
            label: completion.label,
            ...(completion.insertText === undefined ? {} : { insertText: completion.insertText }),
            ...classification,
            sortText: keywordSortText(completion.label, preferred),
        };
    });
};

function classifyKeyword(label: string): { kind: CompletionItemKind; detail: string } {
    if (label === "$") {
        return { kind: CompletionItemKind.Variable, detail: "Start a variable declaration" };
    }
    if (WORD_OPERATORS.has(label) || label === "not") {
        return { kind: CompletionItemKind.Operator, detail: "Operator" };
    }
    if (LITERAL_VALUES.has(label)) {
        return { kind: CompletionItemKind.Value, detail: "Literal" };
    }
    return { kind: CompletionItemKind.Keyword, detail: "Keyword" };
}

function keywordSortText(label: string, preferred: string[]): string {
    const index = preferred.indexOf(label);
    if (index >= 0) {
        return `0:${index.toString().padStart(2, "0")}:${label}`;
    }
    return `${OPTIONAL_KEYWORDS.has(label) ? "2" : "1"}:${label}`;
}

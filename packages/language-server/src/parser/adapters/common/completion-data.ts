import type { LanguageKeywordCompletion } from "server/parser/types/completion.js";

/** Keep the syntax catalog in sync with the lexer; C3 decides which keywords fit. */
export function withGrammarKeywords(
    completions: LanguageKeywordCompletion[],
    symbolicNames: readonly (string | null)[],
    literalNames: readonly (string | null)[],
): LanguageKeywordCompletion[] {
    const configured = new Set(completions.map((item) => item.tokenType));
    const label = (tokenType: number) =>
        literalNames[tokenType]?.replace(/^'|'$/g, "") ??
        symbolicNames[tokenType]!.slice(3).toLowerCase().replaceAll("_", " ");
    for (const [tokenType, symbolicName] of symbolicNames.entries()) {
        if (symbolicName?.startsWith("KW_") && !configured.has(tokenType)) {
            completions.push({ tokenType, label: label(tokenType) });
        }
    }
    return completions.map((item) => {
        if (!item.label.includes(" ") || item.insertText !== undefined) return item;
        const followingTokens = item.label
            .split(" ")
            .slice(1)
            .map((word) => literalNames.indexOf(`'${word}'`));
        return { ...item, followingTokens, fallbackLabel: label(item.tokenType) };
    });
}

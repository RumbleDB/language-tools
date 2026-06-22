import { CodeCompletionCore } from "antlr4-c3";
import { Token } from "antlr4ng";
import { createLogger } from "server/utils/logger.js";

import { getCompletionTokenContext, TokenContextAnalyzer } from "./completion-context.js";
import {
    CompletionIntent,
    CompletionTokenContext,
    KeywordCompletion,
    LanguageKeywordCompletion,
} from "./types/completion.js";
import { ParseResult } from "./types/result.js";
import { findCaretToken } from "./utils.js";

const logger = createLogger("completion");

type CompletionOptions<T extends TokenContextAnalyzer> = {
    tokenContextAnalyzer: new (tokens: Token[], cursorOffset: number) => T;
    ignoredTokens: Set<number>;
    preferredRules: Set<number>;
    languageKeywords: LanguageKeywordCompletion[];
    isFunctionCallRule(ruleIndex: number): boolean;
    isVariableReferenceRule(ruleIndex: number): boolean;
    isTypeReferenceRule(ruleIndex: number): boolean;
    tokenName(tokenType: number): string | number;
    ruleName(ruleIndex: number): string | number;
};

type CompletionCandidates = {
    tokenTypes: Set<number>;
    ruleIndices: Set<number>;
    tokenContext: CompletionTokenContext;
};

export function getCompletionIntent<T extends TokenContextAnalyzer>(
    parsed: ParseResult,
    cursorOffset: number,
    options: CompletionOptions<T>,
): CompletionIntent | null {
    const candidates = collectCompletionCandidates(parsed, cursorOffset, options);

    const allowVariableDeclarations = candidates.tokenContext.allowVariableDeclarations;
    const allowFunctions =
        candidates.tokenContext.allowReferences &&
        hasCandidateRule(candidates, options.isFunctionCallRule);
    const allowVariables =
        candidates.tokenContext.allowReferences &&
        hasCandidateRule(candidates, options.isVariableReferenceRule);
    const allowTypes =
        candidates.tokenContext.allowTypeReferences ||
        (candidates.tokenContext.allowReferences &&
            hasCandidateRule(candidates, options.isTypeReferenceRule));
    const keywords = keywordCompletions(candidates, options.languageKeywords);

    const expectedTokens = [...candidates.tokenTypes].map(options.tokenName);
    const expectedRules = [...candidates.ruleIndices].map(options.ruleName);

    logger.debug("Completion candidates:", {
        allowFunctions,
        allowVariables,
        allowTypes,
        allowVariableDeclarations,
        keywords,
        expectedTokens,
        expectedRules,
        tokenContext: candidates.tokenContext,
    });

    return {
        allowVariableReferences: allowVariables,
        allowVariableDeclarations,
        allowFunctions,
        allowTypes,
        keywords,
    };
}

function hasCandidateRule(
    candidates: CompletionCandidates,
    predicate: (ruleIndex: number) => boolean,
): boolean {
    return [...candidates.ruleIndices].some(predicate);
}

function hasCandidateToken(candidates: CompletionCandidates, tokenType: number): boolean {
    return candidates.tokenTypes.has(tokenType);
}

function keywordCompletions(
    candidates: CompletionCandidates,
    languageKeywords: LanguageKeywordCompletion[],
): KeywordCompletion[] {
    if (!candidates.tokenContext.allowKeywords) {
        return [];
    }

    return languageKeywords
        .filter(
            (completion) =>
                hasCandidateToken(candidates, completion.tokenType) &&
                (!completion.prologOnly || candidates.tokenContext.allowPrologKeywords),
        )
        .map(({ label, insertText }) => ({
            label,
            ...(insertText === undefined ? {} : { insertText }),
        }));
}

function collectCompletionCandidates<T extends TokenContextAnalyzer>(
    parsed: ParseResult,
    cursorOffset: number,
    options: {
        tokenContextAnalyzer: new (tokens: Token[], cursorOffset: number) => T;
        ignoredTokens: Set<number>;
        preferredRules: Set<number>;
    },
): CompletionCandidates {
    const caret = findCaretToken(parsed.tokens, cursorOffset);

    const core = new CodeCompletionCore(parsed.parser);
    core.ignoredTokens = options.ignoredTokens;
    core.preferredRules = options.preferredRules;

    const candidates = core.collectCandidates(caret.tokenIndex);

    return {
        tokenTypes: new Set(
            [...candidates.tokens.keys()].filter((tokenType) => tokenType !== Token.EOF),
        ),
        ruleIndices: new Set(candidates.rules.keys()),
        tokenContext: getCompletionTokenContext(
            parsed.tokens,
            cursorOffset,
            options.tokenContextAnalyzer,
        ),
    };
}

import { CodeCompletionCore } from "antlr4-c3";
import { ParserRuleContext, Token } from "antlr4ng";
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

export type RuleCandidateInfo = {
    startTokenIndex: number;
    ruleList: number[];
};

type CompletionOptions<T extends TokenContextAnalyzer> = {
    tokenContextAnalyzer: new (tokens: Token[], cursorOffset: number) => T;
    ignoredTokens: Set<number>;
    preferredRules: Set<number>;
    clauseStartRules: ReadonlyMap<number, number>;
    languageKeywords: LanguageKeywordCompletion[];
    isFunctionCallRule(ruleIndex: number): boolean;
    isObjectLookupRule(ruleIndex: number): boolean;
    isObjectLookupDotToken(tokenType: number): boolean;
    isCatchErrorTargetRule(ruleIndex: number, candidate?: RuleCandidateInfo): boolean;
    isVariableReferenceRule(ruleIndex: number): boolean;
    tokenName(tokenType: number): string | number;
    ruleName(ruleIndex: number): string | number;
};

type CompletionCandidates = {
    tokenTypes: Set<number>;
    rules: Map<number, RuleCandidateInfo>;
    ruleIndices: Set<number>;
    tokenContext: CompletionTokenContext;
};

export function getCompletionIntent<T extends TokenContextAnalyzer>(
    parsed: ParseResult,
    cursorOffset: number,
    options: CompletionOptions<T>,
): CompletionIntent | null {
    const candidates = collectCompletionCandidates(parsed, cursorOffset, options);

    const qnamePrefix = candidates.tokenContext.qnamePrefix;
    const allowFunctions =
        candidates.tokenContext.allowReferences &&
        (qnamePrefix || hasCandidateRule(candidates, options.isFunctionCallRule));
    const allowVariables =
        candidates.tokenContext.allowReferences &&
        !qnamePrefix &&
        hasCandidateRule(candidates, options.isVariableReferenceRule);
    const objectLookupDotOffset = findObjectLookupDotOffset(
        parsed.tokens,
        cursorOffset,
        options.isObjectLookupDotToken,
    );
    const allowObjectLookup =
        candidates.tokenContext.allowReferences &&
        !qnamePrefix &&
        hasCandidateRule(candidates, options.isObjectLookupRule) &&
        objectLookupDotOffset !== undefined;
    const allowTypes = candidates.tokenContext.allowTypeReferences;
    const allowErrorCodeTargets = hasCandidateRule(candidates, options.isCatchErrorTargetRule);
    const keywords = qnamePrefix ? [] : keywordCompletions(candidates, options.languageKeywords);

    const expectedTokens = [...candidates.tokenTypes].map(options.tokenName);
    const expectedRules = [...candidates.ruleIndices].map(options.ruleName);

    logger.debug("Completion candidates:", {
        allowFunctions,
        allowVariables,
        allowObjectLookup,
        allowTypes,
        objectLookupDotOffset,
        keywords,
        expectedTokens,
        expectedRules,
        tokenContext: candidates.tokenContext,
    });

    return {
        allowVariableReferences: allowVariables,
        allowFunctions,
        allowObjectLookup,
        ...(objectLookupDotOffset === undefined ? {} : { objectLookupDotOffset }),
        allowTypes,
        allowErrorCodeTargets,
        keywords,
    };
}

function hasCandidateRule(
    candidates: CompletionCandidates,
    predicate: (ruleIndex: number, candidate?: RuleCandidateInfo) => boolean,
): boolean {
    return [...candidates.rules.entries()].some(([ruleIndex, candidate]) =>
        predicate(ruleIndex, candidate),
    );
}

function hasCandidateToken(candidates: CompletionCandidates, tokenType: number): boolean {
    return candidates.tokenTypes.has(tokenType);
}

/// This is used to strip out object lookup dot tokens that are not actually part of an object lookup expression, e.g. in the following example:
/// ```
/// let x = 1;
/// x. // <- cursor here
/// ```
/// We send only the query text up to the dot to the server so it does not give errors
function findObjectLookupDotOffset(
    tokens: Token[],
    cursorOffset: number,
    isObjectLookupDotToken: (tokenType: number) => boolean,
): number | undefined {
    return tokens
        .filter(
            (token) =>
                token.type !== Token.EOF &&
                isObjectLookupDotToken(token.type) &&
                token.start < cursorOffset &&
                token.stop < cursorOffset,
        )
        .at(-1)?.start;
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
        clauseStartRules: ReadonlyMap<number, number>;
        tokenName(tokenType: number): string | number;
    },
): CompletionCandidates {
    // At `re|`, collect candidates before the unfinished identifier so `return`
    // remains available. Numbers and punctuation still count as consumed input.
    const caret = findCaretToken(
        parsed.tokens,
        cursorOffset,
        (token) => options.tokenName(token.type) === "NCName",
    );

    const core = new CodeCompletionCore(parsed.parser);
    core.ignoredTokens = options.ignoredTokens;
    core.preferredRules = options.preferredRules;

    let candidates = core.collectCandidates(caret.tokenIndex);
    const previous = parsed.tokens
        .filter(
            (token) =>
                token.tokenIndex < caret.tokenIndex && token.channel === Token.DEFAULT_CHANNEL,
        )
        .at(-1);
    const clauseRule =
        previous === undefined ? undefined : options.clauseStartRules.get(previous.type);
    // `for` and `let` can also be path/function names. If the grammar expects a
    // binding here, collect within the query clause to exclude those name paths.
    // This preserves all clause alternatives (including window clauses) and lets
    // the grammar supply `$` just like any other syntax token.
    if (
        previous !== undefined &&
        clauseRule !== undefined &&
        [...candidates.tokens.keys()].some((tokenType) => options.tokenName(tokenType) === "DOLLAR")
    ) {
        candidates = core.collectCandidates(
            caret.tokenIndex,
            new CompletionRuleContext(clauseRule, previous),
        );
    }
    const candidateRules = new Map<number, RuleCandidateInfo>();
    for (const [ruleIndex, candidate] of candidates.rules.entries()) {
        candidateRules.set(ruleIndex, {
            startTokenIndex: candidate.startTokenIndex,
            ruleList: candidate.ruleList,
        });
    }

    return {
        tokenTypes: new Set(
            [...candidates.tokens.keys()].filter((tokenType) => tokenType !== Token.EOF),
        ),
        rules: candidateRules,
        ruleIndices: new Set(candidates.rules.keys()),
        tokenContext: getCompletionTokenContext(
            parsed.tokens,
            cursorOffset,
            options.tokenContextAnalyzer,
        ),
    };
}

/** A grammar entry point for collecting a clause's candidates before its CST exists. */
class CompletionRuleContext extends ParserRuleContext {
    public constructor(
        private readonly completionRuleIndex: number,
        start: Token,
    ) {
        super(null);
        this.start = start;
    }

    public override get ruleIndex(): number {
        return this.completionRuleIndex;
    }
}

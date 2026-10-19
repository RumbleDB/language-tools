import { CodeCompletionCore } from "antlr4-c3";
import { ParserRuleContext, Token } from "antlr4ng";
import { lowerBound } from "server/utils/binary-search.js";
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
    isCommentToken(tokenType: number): boolean;
    isStringLiteralRule(ruleIndex: number): boolean;
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
    // Strings and comments may contain any token, such as `/` in a URI, so the grammar
    // would accept every keyword there.
    if (isInCommentOrString(parsed, cursorOffset, options)) {
        return null;
    }

    const candidates = collectCompletionCandidates(parsed, cursorOffset, options);

    const qnamePrefix = candidates.tokenContext.qnamePrefix;
    const allowFunctions =
        candidates.tokenContext.allowReferences &&
        hasCandidateRule(candidates, options.isFunctionCallRule);
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

/** Whether the cursor is inside a comment or after the opening quote of a string literal. */
function isInCommentOrString(
    parsed: ParseResult,
    cursorOffset: number,
    options: Pick<
        CompletionOptions<TokenContextAnalyzer>,
        "isCommentToken" | "isStringLiteralRule"
    >,
): boolean {
    // Tokens do not overlap, so only the last one that starts before the cursor can contain it.
    const after = lowerBound(parsed.tokens, cursorOffset, (each, target) => each.start - target);
    const token = parsed.tokens[after - 1];
    const inComment =
        token !== undefined && options.isCommentToken(token.type) && cursorOffset <= token.stop;
    return inComment || containsStringAt(parsed.tree, cursorOffset, options.isStringLiteralRule);
}

function containsStringAt(
    context: ParserRuleContext,
    offset: number,
    isStringLiteralRule: (ruleIndex: number) => boolean,
): boolean {
    const { start, stop } = context;
    if (start === null || offset <= start.start || (stop !== null && offset > stop.stop + 1)) {
        return false;
    }
    if (isStringLiteralRule(context.ruleIndex)) {
        // Up to the closing quote, or to the end when the string is unterminated.
        const closed = stop !== null && stop !== start && stop.type === start.type;
        return !closed || offset <= stop.start;
    }
    return context.children.some(
        (child) =>
            child instanceof ParserRuleContext &&
            containsStringAt(child, offset, isStringLiteralRule),
    );
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
    const tokenContext = getCompletionTokenContext(
        parsed.tokens,
        cursorOffset,
        options.tokenContextAnalyzer,
    );
    // The editor filters suggestions by the word at the cursor, so at the end of a
    // name or keyword, such as `re|` or `order|`, collect candidates where the word
    // starts. Numbers and punctuation still count as consumed input.
    // At `fn:|`, the lexer has not produced a prefixed name yet, and no grammar rule
    // continues a function name from `fn` `:`, so collect before the prefix instead.
    const caret = tokenContext.qnamePrefix
        ? { tokenIndex: qnamePrefixTokenIndex(parsed.tokens, cursorOffset) }
        : findCaretToken(parsed.tokens, cursorOffset, (token) =>
              isWordToken(options.tokenName(token.type)),
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
        tokenContext,
    };
}

const NAME_TOKEN_NAMES = new Set<string | number>(["NCName", "FullQName", "URIQualifiedName"]);

/** Whether a token is a name or a keyword, which the editor treats as a word. */
function isWordToken(tokenName: string | number): boolean {
    return (
        NAME_TOKEN_NAMES.has(tokenName) ||
        (typeof tokenName === "string" && tokenName.startsWith("KW_"))
    );
}

/** The index of the prefix token in a `prefix:` that ends at the cursor. */
function qnamePrefixTokenIndex(tokens: Token[], cursorOffset: number): number {
    const tokensBeforeCursor = tokens.filter(
        (token) =>
            token.type !== Token.EOF &&
            token.channel === Token.DEFAULT_CHANNEL &&
            token.start < cursorOffset,
    );
    return tokensBeforeCursor.at(-2)!.tokenIndex;
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

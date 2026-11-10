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
import { findCaretToken, defaultTokenBefore } from "./utils.js";

const logger = createLogger("completion");

export type RuleCandidateInfo = {
    startTokenIndex: number;
    ruleList: number[];
};

export type CompletionStartRule = {
    ruleIndex: number;
    requiredToken: number;
    startAfterIntroducer?: boolean;
};

type CompletionOptions<T extends TokenContextAnalyzer> = {
    tokenContextAnalyzer: new (tokens: Token[], cursorOffset: number) => T;
    ignoredTokens: Set<number>;
    preferredRules: Set<number>;
    completionStartRules: ReadonlyMap<number, CompletionStartRule>;
    languageKeywords: LanguageKeywordCompletion[];
    isFunctionReferenceRule(ruleIndex: number, candidate?: RuleCandidateInfo): boolean;
    isObjectLookupRule(ruleIndex: number): boolean;
    isDeclarationNameRule(ruleIndex: number, candidate?: RuleCandidateInfo): boolean;
    isTypeReferenceRule(ruleIndex: number, candidate?: RuleCandidateInfo): boolean;
    isCommentToken(tokenType: number): boolean;
    isStringLiteralRule(ruleIndex: number): boolean;
    isLiteralXmlRule(ruleIndex: number): boolean;
    isCatchErrorTargetRule(ruleIndex: number, candidate?: RuleCandidateInfo): boolean;
    isVariableReferenceRule(ruleIndex: number): boolean;
    tokenName(tokenType: number): string | number;
    ruleName(ruleIndex: number): string | number;
};

type CompletionCandidates = {
    tokens: Map<number, number[]>;
    rules: Map<number, RuleCandidateInfo>;
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
    if (
        hasCandidateRule(candidates, options.isLiteralXmlRule) &&
        !isInParsedExpression(parsed.tree, cursorOffset, options.ruleName)
    ) {
        return null;
    }

    const qnamePrefix = candidates.tokenContext.qnamePrefix;
    const allowFunctions = hasCandidateRule(candidates, options.isFunctionReferenceRule);
    const allowVariables =
        !qnamePrefix && hasCandidateRule(candidates, options.isVariableReferenceRule);
    const allowObjectLookup =
        !qnamePrefix && hasCandidateRule(candidates, options.isObjectLookupRule);
    const allowTypes = hasCandidateRule(candidates, options.isTypeReferenceRule);
    const allowErrorCodeTargets = hasCandidateRule(candidates, options.isCatchErrorTargetRule);
    const keywords =
        qnamePrefix || allowTypes || hasCandidateRule(candidates, options.isDeclarationNameRule)
            ? []
            : keywordCompletions(candidates, options.languageKeywords);

    const expectedTokens = [...candidates.tokens.keys()].map(options.tokenName);
    const expectedRules = [...candidates.rules.keys()].map(options.ruleName);

    logger.debug("Completion candidates:", {
        allowFunctions,
        allowVariables,
        allowObjectLookup,
        allowTypes,
        keywords,
        expectedTokens,
        expectedRules,
        tokenContext: candidates.tokenContext,
    });

    return {
        allowVariableReferences: allowVariables,
        allowFunctions,
        allowObjectLookup,
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
    if (inComment || isInUnterminatedComment(parsed, cursorOffset, options.isStringLiteralRule)) {
        return true;
    }
    // Whitespace after an unterminated string is not part of its rule, so look from the end of the last token.
    const previous = defaultTokenBefore(parsed.tokens, cursorOffset);
    return (
        previous !== undefined &&
        containsStringAt(parsed.tree, previous.stop + 1, options.isStringLiteralRule)
    );
}

/** The lexer only makes a comment token of a closed comment. Without one, `(:` stays two tokens to the end of the text. */
function isInUnterminatedComment(
    { tokens, tree }: ParseResult,
    cursorOffset: number,
    isStringLiteralRule: (ruleIndex: number) => boolean,
): boolean {
    return tokens.some(
        (token, index) =>
            token.text === "(" &&
            tokens[index + 1]?.text === ":" &&
            tokens[index + 1]!.stop < cursorOffset &&
            !containsStringAt(tree, token.start, isStringLiteralRule),
    );
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

/** Use the closest expression or direct XML constructor to resolve C3's text/code ambiguity. */
function isInParsedExpression(
    tree: ParserRuleContext,
    offset: number,
    ruleName: (ruleIndex: number) => string | number,
): boolean {
    let context: ParserRuleContext | undefined = tree;
    let inExpression = false;
    while (context !== undefined) {
        const rule = ruleName(context.ruleIndex);
        if (rule === "expr") inExpression = true;
        if (rule === "directConstructor") inExpression = false;

        context = context.children.findLast(
            (child): child is ParserRuleContext =>
                child instanceof ParserRuleContext &&
                child.start !== null &&
                child.stop !== null &&
                child.start.start <= offset &&
                offset <= child.stop.stop + 1,
        );
    }
    return inExpression;
}

function hasCandidateRule(
    candidates: CompletionCandidates,
    predicate: (ruleIndex: number, candidate?: RuleCandidateInfo) => boolean,
): boolean {
    return [...candidates.rules.entries()].some(([ruleIndex, candidate]) =>
        predicate(ruleIndex, candidate),
    );
}

function keywordCompletions(
    candidates: CompletionCandidates,
    languageKeywords: LanguageKeywordCompletion[],
): KeywordCompletion[] {
    return languageKeywords.flatMap(
        ({ label, insertText, followingTokens, fallbackLabel, tokenType }) => {
            const followers = candidates.tokens.get(tokenType);
            if (followers === undefined) return [];
            const conflicts =
                followers.length > 0 &&
                followingTokens?.some((token, index) => followers[index] !== token);
            return [
                {
                    label: conflicts ? (fallbackLabel ?? label) : label,
                    ...(insertText === undefined ? {} : { insertText }),
                },
            ];
        },
    );
}

function collectCompletionCandidates<T extends TokenContextAnalyzer>(
    parsed: ParseResult,
    cursorOffset: number,
    options: {
        tokenContextAnalyzer: new (tokens: Token[], cursorOffset: number) => T;
        ignoredTokens: Set<number>;
        preferredRules: Set<number>;
        completionStartRules: ReadonlyMap<number, CompletionStartRule>;
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

    // Without a context, c3 starts from rule 0. That is not the entry rule, because
    // ANTLR places a grammar's imported rules after its own.
    const candidates = core.collectCandidates(caret.tokenIndex, parsed.tree);
    const previous = parsed.tokens
        .filter(
            (token) =>
                token.tokenIndex < caret.tokenIndex && token.channel === Token.DEFAULT_CHANNEL,
        )
        .at(-1);
    const startRule =
        previous === undefined ? undefined : options.completionStartRules.get(previous.type);
    // Introducers such as `for`, `declare`, and `validate` can also be names.
    // A required syntax continuation proves that the construct can start here;
    // collect within it to exclude candidates from the competing name paths.
    if (
        previous !== undefined &&
        startRule !== undefined &&
        candidates.tokens.has(startRule.requiredToken)
    ) {
        // C3 reuses its candidate maps. Save the document's candidates before narrowing.
        const documentTokens = new Map(candidates.tokens);
        const documentRules = new Map(candidates.rules);
        core.collectCandidates(
            caret.tokenIndex,
            new CompletionRuleContext(
                startRule.ruleIndex,
                startRule.startAfterIntroducer ? parsed.tokens[caret.tokenIndex]! : previous,
            ),
        );
        // The narrower rule can only remove options. It does not see the preceding query.
        for (const token of candidates.tokens.keys()) {
            if (!documentTokens.has(token)) candidates.tokens.delete(token);
        }
        for (const rule of candidates.rules.keys()) {
            const candidate = documentRules.get(rule);
            if (candidate === undefined) candidates.rules.delete(rule);
            else candidates.rules.set(rule, candidate);
        }
    }
    candidates.tokens.delete(Token.EOF);

    return { tokens: candidates.tokens, rules: candidates.rules, tokenContext };
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

/** A grammar entry point for collecting a construct's candidates before its CST exists. */
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

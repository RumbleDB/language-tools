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
    /** The only keywords offered where an expression can start. */
    expressionKeywords: ReadonlySet<number>;
    isFunctionReferenceRule(ruleIndex: number, candidate?: RuleCandidateInfo): boolean;
    /** A function name after `=>`, which is also a function reference rule. */
    isArrowFunctionRule(ruleIndex: number, candidate?: RuleCandidateInfo): boolean;
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
    if (isInComment(parsed, cursorOffset, options)) {
        return null;
    }
    const stringStart = findStringStart(parsed, cursorOffset, options.isStringLiteralRule);
    if (stringStart !== undefined) {
        return {
            allowVariableReferences: false,
            allowFunctions: false,
            allowObjectLookup: false,
            allowTypes: false,
            allowErrorCodeTargets: false,
            keywords: [],
            stringStart,
        };
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
    // Only when no plain call can be written here too, as one would then insert all its arguments.
    const arrowFunction =
        hasCandidateRule(candidates, options.isArrowFunctionRule) &&
        !hasCandidateRule(
            candidates,
            (ruleIndex, candidate) =>
                options.isFunctionReferenceRule(ruleIndex, candidate) &&
                !options.isArrowFunctionRule(ruleIndex, candidate),
        );
    const allowVariables =
        !qnamePrefix && hasCandidateRule(candidates, options.isVariableReferenceRule);
    const allowObjectLookup =
        !qnamePrefix && hasCandidateRule(candidates, options.isObjectLookupRule);
    const allowTypes = hasCandidateRule(candidates, options.isTypeReferenceRule);
    const allowErrorCodeTargets = hasCandidateRule(candidates, options.isCatchErrorTargetRule);
    const keywords =
        qnamePrefix || allowTypes || hasCandidateRule(candidates, options.isDeclarationNameRule)
            ? []
            : keywordCompletions(
                  candidates,
                  allowFunctions || allowVariables
                      ? options.languageKeywords.filter(({ tokenType }) =>
                            options.expressionKeywords.has(tokenType),
                        )
                      : options.languageKeywords,
              );

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
        ...(arrowFunction && { arrowFunction: true }),
        allowObjectLookup,
        allowTypes,
        allowErrorCodeTargets,
        keywords,
    };
}

/** Whether the cursor is inside a comment. */
function isInComment(
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
    return inComment || isInUnterminatedComment(parsed, cursorOffset, options.isStringLiteralRule);
}

/** Where the string literal starts, at its opening quote, when the cursor is after that quote. */
function findStringStart(
    { tokens, tree }: ParseResult,
    cursorOffset: number,
    isStringLiteralRule: (ruleIndex: number) => boolean,
): number | undefined {
    // Whitespace after an unterminated string is not part of its rule, so look from the end of the last token.
    const previous = defaultTokenBefore(tokens, cursorOffset);
    return previous === undefined
        ? undefined
        : findStringAt(tree, previous.stop + 1, isStringLiteralRule)?.start?.start;
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
            findStringAt(tree, token.start, isStringLiteralRule) === undefined,
    );
}

/** The string literal whose opening quote is before the offset, and whose closing quote, if any, is not. */
function findStringAt(
    context: ParserRuleContext,
    offset: number,
    isStringLiteralRule: (ruleIndex: number) => boolean,
): ParserRuleContext | undefined {
    const { start, stop } = context;
    if (start === null || offset <= start.start || (stop !== null && offset > stop.stop + 1)) {
        return undefined;
    }
    if (isStringLiteralRule(context.ruleIndex)) {
        // Up to the closing quote, or to the end when the string is unterminated.
        const closed = stop !== null && stop !== start && stop.type === start.type;
        return !closed || offset <= stop.start ? context : undefined;
    }
    for (const child of context.children) {
        const string =
            child instanceof ParserRuleContext
                ? findStringAt(child, offset, isStringLiteralRule)
                : undefined;
        if (string !== undefined) {
            return string;
        }
    }
    return undefined;
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
    let { tokens, rules } = core.collectCandidates(caret.tokenIndex, parsed.tree);
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
    if (previous !== undefined && startRule !== undefined && tokens.has(startRule.requiredToken)) {
        // C3 reuses its candidate maps, so copy the document's candidates before narrowing.
        const whole = { tokens: new Map(tokens), rules: new Map(rules) };
        const narrowed = core.collectCandidates(
            caret.tokenIndex,
            new CompletionRuleContext(
                startRule.ruleIndex,
                startRule.startAfterIntroducer ? parsed.tokens[caret.tokenIndex]! : previous,
            ),
        );
        // The narrower rule can only remove options. It does not see the preceding query, so
        // the rule paths come from the document.
        tokens = new Map([...narrowed.tokens].filter(([token]) => whole.tokens.has(token)));
        rules = new Map(
            [...narrowed.rules.keys()].flatMap((rule) => {
                const candidate = whole.rules.get(rule);
                return candidate === undefined ? [] : [[rule, candidate] as const];
            }),
        );
    }
    tokens.delete(Token.EOF);

    return { tokens, rules, tokenContext };
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

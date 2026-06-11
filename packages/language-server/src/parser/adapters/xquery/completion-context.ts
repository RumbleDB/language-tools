import { CodeCompletionCore } from "antlr4-c3";
import { Token } from "antlr4ng";
import type { CompletionIntent, ParserKeywordCompletion } from "server/parser/types/completion.js";
import { findCaretToken } from "server/parser/utils.js";
import { createLogger } from "server/utils/logger.js";

import {
    IGNORED_COMPLETION_TOKENS,
    KEYWORD_COMPLETIONS,
    PREFERRED_COMPLETION_RULES,
} from "./completion-data.js";
import {
    getCompletionTokenContext,
    type CompletionTokenContext,
} from "./completion-token-context.js";
import { XQueryParser } from "./grammar/XQueryParser.js";
import type { XQueryParsedDocument } from "./parse.js";

export function getCompletionIntent(
    parsed: XQueryParsedDocument,
    cursorOffset: number,
): CompletionIntent | null {
    return toCompletionIntent(collectCompletionCandidates(parsed, cursorOffset));
}

const logger = createLogger("completion-context");

interface XQueryCompletionCandidates {
    tokenTypes: Set<number>;
    ruleIndices: Set<number>;
    tokenContext: CompletionTokenContext;
}

function collectCompletionCandidates(
    parsed: XQueryParsedDocument,
    cursorOffset: number,
): XQueryCompletionCandidates {
    const caret = findCaretToken(parsed.tokens, cursorOffset);
    const candidates = getCompletionCandidates(parsed.parser, caret.tokenIndex);

    return {
        tokenTypes: new Set(
            [...candidates.tokens.keys()].filter((tokenType) => tokenType !== Token.EOF),
        ),
        ruleIndices: new Set(candidates.rules.keys()),
        tokenContext: getCompletionTokenContext(parsed.tokens, cursorOffset),
    };
}

function toCompletionIntent(candidates: XQueryCompletionCandidates): CompletionIntent {
    const allowVariableDeclarations = candidates.tokenContext.allowVariableDeclarations;
    const allowFunctions =
        candidates.tokenContext.allowReferences &&
        hasCandidateRule(candidates, XQueryParser.RULE_functionCall);
    const allowVariables =
        candidates.tokenContext.allowReferences &&
        hasCandidateRule(candidates, XQueryParser.RULE_varRef);
    const keywords = keywordCompletions(candidates);

    const expectedTokens = [...candidates.tokenTypes].map(
        (tokenType) => XQueryParser.symbolicNames[tokenType] ?? tokenType,
    );
    const expectedRules = [...candidates.ruleIndices].map(
        (ruleIndex) => XQueryParser.ruleNames[ruleIndex] ?? ruleIndex,
    );

    logger.debug("Completion candidates:", {
        allowFunctions,
        allowVariables,
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
        keywords,
    };
}

function hasCandidateRule(candidates: XQueryCompletionCandidates, ruleIndex: number): boolean {
    return candidates.ruleIndices.has(ruleIndex);
}

function hasCandidateToken(candidates: XQueryCompletionCandidates, tokenType: number): boolean {
    return candidates.tokenTypes.has(tokenType);
}

function getCompletionCandidates(parser: XQueryParser, caretTokenIndex: number) {
    const core = new CodeCompletionCore(parser);
    core.ignoredTokens = IGNORED_COMPLETION_TOKENS;
    core.preferredRules = PREFERRED_COMPLETION_RULES;

    return core.collectCandidates(caretTokenIndex);
}

function keywordCompletions(candidates: XQueryCompletionCandidates): ParserKeywordCompletion[] {
    if (!candidates.tokenContext.allowKeywords) {
        return [];
    }

    return KEYWORD_COMPLETIONS.filter(
        (completion) =>
            hasCandidateToken(candidates, completion.tokenType) &&
            (!completion.prologOnly || candidates.tokenContext.allowPrologKeywords),
    ).map(({ label, insertText }) => ({
        label,
        ...(insertText === undefined ? {} : { insertText }),
    }));
}

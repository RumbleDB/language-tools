import { getCompletionIntent } from "server/parser/completion.js";
import type { ParserAdapter } from "server/parser/types/adapter.js";
import { getActiveParserId } from "server/parser/utils.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    CLAUSE_START_RULES,
    IGNORED_COMPLETION_TOKENS,
    KEYWORD_COMPLETIONS,
    PREFERRED_COMPLETION_RULES,
} from "./completion-data.js";
import { XQueryTokenContextAnalyzer } from "./completion-token-context.js";
import { XQueryLexer } from "./grammar/XQueryLexer.js";
import { XQueryParser } from "./grammar/XQueryParser.js";
import { parseXQuery } from "./parse.js";

export const xqueryParserAdapter: ParserAdapter = {
    id: "xquery",
    supports: (document: TextDocument) => getActiveParserId(document) === "xquery",
    parse: parseXQuery,
    getCompletionIntent: (parsed, cursorOffset) =>
        getCompletionIntent(parsed, cursorOffset, {
            tokenContextAnalyzer: XQueryTokenContextAnalyzer,
            ignoredTokens: IGNORED_COMPLETION_TOKENS,
            clauseStartRules: CLAUSE_START_RULES,
            preferredRules: PREFERRED_COMPLETION_RULES,
            languageKeywords: KEYWORD_COMPLETIONS,
            // A call or a named function reference, but not the name in a declaration.
            isFunctionReferenceRule: (ruleIndex, candidate) =>
                ruleIndex === XQueryParser.RULE_functionName &&
                candidate?.ruleList.at(-1) !== XQueryParser.RULE_functionDecl,
            isObjectLookupRule: () => false,
            isObjectLookupDotToken: () => false,
            isCommentToken: (tokenType) => tokenType === XQueryLexer.XQComment,
            isStringLiteralRule: (ruleIndex) => ruleIndex === XQueryParser.RULE_stringLiteral,
            isCatchErrorTargetRule: (ruleIndex, candidate) =>
                ruleIndex === XQueryParser.RULE_nameTest &&
                (candidate?.ruleList.includes(XQueryParser.RULE_catchClause) === true ||
                    candidate?.ruleList.includes(XQueryParser.RULE_catchCaseStatement) === true),
            isVariableReferenceRule: (ruleIndex) => ruleIndex === XQueryParser.RULE_varRef,
            tokenName: (tokenType) => XQueryParser.symbolicNames[tokenType] ?? tokenType,
            ruleName: (ruleIndex) => XQueryParser.ruleNames[ruleIndex] ?? ruleIndex,
        }),
};

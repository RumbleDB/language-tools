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
import { JsoniqTokenContextAnalyzer } from "./completion-token-context.js";
import { JsoniqLexer } from "./grammar/JsoniqLexer.js";
import { JsoniqParser } from "./grammar/JsoniqParser.js";
import { parseJsoniq } from "./parse.js";

export const jsoniqParserAdapter: ParserAdapter = {
    id: "jsoniq",
    supports: (document: TextDocument) => getActiveParserId(document) === "jsoniq",
    parse: parseJsoniq,
    getCompletionIntent: (parsed, cursorOffset) =>
        getCompletionIntent(parsed, cursorOffset, {
            tokenContextAnalyzer: JsoniqTokenContextAnalyzer,
            ignoredTokens: IGNORED_COMPLETION_TOKENS,
            clauseStartRules: CLAUSE_START_RULES,
            preferredRules: PREFERRED_COMPLETION_RULES,
            languageKeywords: KEYWORD_COMPLETIONS,
            // Calls, named function references, and named arrow specifiers.
            isFunctionReferenceRule: (ruleIndex, candidate) =>
                (ruleIndex === JsoniqParser.RULE_functionName &&
                    candidate?.ruleList.at(-1) !== JsoniqParser.RULE_functionDecl) ||
                (ruleIndex === JsoniqParser.RULE_eqName &&
                    candidate?.ruleList.at(-1) === JsoniqParser.RULE_arrowFunctionSpecifier),
            isTypeReferenceRule: (ruleIndex, candidate) =>
                ruleIndex === JsoniqParser.RULE_eqName &&
                [
                    JsoniqParser.RULE_itemType,
                    JsoniqParser.RULE_typeName,
                    JsoniqParser.RULE_typedMapTest,
                ].includes(candidate?.ruleList.at(-1) ?? -1),
            isObjectLookupRule: (ruleIndex) => ruleIndex === JsoniqParser.RULE_objectLookupKey,
            isCommentToken: (tokenType) => tokenType === JsoniqLexer.XQComment,
            isStringLiteralRule: (ruleIndex) => ruleIndex === JsoniqParser.RULE_stringLiteral,
            isCatchErrorTargetRule: (ruleIndex, candidate) =>
                ruleIndex === JsoniqParser.RULE_nameTest &&
                (candidate?.ruleList.includes(JsoniqParser.RULE_catchClause) === true ||
                    candidate?.ruleList.includes(JsoniqParser.RULE_catchCaseStatement) === true),
            isVariableReferenceRule: (ruleIndex) => ruleIndex === JsoniqParser.RULE_varRef,
            tokenName: (tokenType) => JsoniqParser.symbolicNames[tokenType] ?? tokenType,
            ruleName: (ruleIndex) => JsoniqParser.ruleNames[ruleIndex] ?? ruleIndex,
        }),
};

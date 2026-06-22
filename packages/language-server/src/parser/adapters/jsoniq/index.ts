import { getCompletionIntent } from "server/parser/completion.js";
import type { ParserAdapter } from "server/parser/types/adapter.js";
import { getActiveParserId } from "server/parser/utils.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    IGNORED_COMPLETION_TOKENS,
    KEYWORD_COMPLETIONS,
    PREFERRED_COMPLETION_RULES,
} from "./completion-data.js";
import { JsoniqTokenContextAnalyzer } from "./completion-token-context.js";
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
            preferredRules: PREFERRED_COMPLETION_RULES,
            languageKeywords: KEYWORD_COMPLETIONS,
            isFunctionCallRule: (ruleIndex) => ruleIndex === JsoniqParser.RULE_functionCall,
            isVariableReferenceRule: (ruleIndex) => ruleIndex === JsoniqParser.RULE_varRef,
            isTypeReferenceRule: (ruleIndex) =>
                ruleIndex === JsoniqParser.RULE_sequenceType ||
                ruleIndex === JsoniqParser.RULE_itemType ||
                ruleIndex === JsoniqParser.RULE_simpleTypeName ||
                ruleIndex === JsoniqParser.RULE_typeName,
            tokenName: (tokenType) => JsoniqParser.symbolicNames[tokenType] ?? tokenType,
            ruleName: (ruleIndex) => JsoniqParser.ruleNames[ruleIndex] ?? ruleIndex,
        }),
};

import { getCompletionIntent } from "server/parser/completion.js";
import type { ParserAdapter } from "server/parser/types/adapter.js";
import { hasJsoniqCellMagic } from "server/parser/utils.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    IGNORED_COMPLETION_TOKENS,
    KEYWORD_COMPLETIONS,
    PREFERRED_COMPLETION_RULES,
} from "./completion-data.js";
import { XQueryTokenContextAnalyzer } from "./completion-token-context.js";
import { XQueryParser } from "./grammar/XQueryParser.js";
import { parseXQuery } from "./parse.js";

const JSONIQ_LANGUAGE_ID = "jsoniq";

export const xqueryParserAdapter: ParserAdapter = {
    id: "xquery",
    supports: (document: TextDocument) =>
        document.languageId === JSONIQ_LANGUAGE_ID || hasJsoniqCellMagic(document),
    parse: parseXQuery,
    getCompletionIntent: (parsed, cursorOffset) =>
        getCompletionIntent(parsed, cursorOffset, {
            tokenContextAnalyzer: XQueryTokenContextAnalyzer,
            ignoredTokens: IGNORED_COMPLETION_TOKENS,
            preferredRules: PREFERRED_COMPLETION_RULES,
            languageKeywords: KEYWORD_COMPLETIONS,
            isFunctionCallRule: (ruleIndex) => ruleIndex === XQueryParser.RULE_functionCall,
            isVariableReferenceRule: (ruleIndex) => ruleIndex === XQueryParser.RULE_varRef,
            tokenName: (tokenType) => XQueryParser.symbolicNames[tokenType] ?? tokenType,
            ruleName: (ruleIndex) => XQueryParser.ruleNames[ruleIndex] ?? ruleIndex,
        }),
};

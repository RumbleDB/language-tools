import { getCompletionIntent } from "server/parser/completion.js";
import type { ParserAdapter } from "server/parser/types/adapter.js";
import { getActiveParserId } from "server/parser/utils.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    COMPLETION_START_RULES,
    EXPRESSION_KEYWORDS,
    IGNORED_COMPLETION_TOKENS,
    KEYWORD_COMPLETIONS,
    LITERAL_XML_RULES,
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
            completionStartRules: COMPLETION_START_RULES,
            preferredRules: PREFERRED_COMPLETION_RULES,
            languageKeywords: KEYWORD_COMPLETIONS,
            expressionKeywords: EXPRESSION_KEYWORDS,
            // Calls, named function references, and named arrow specifiers.
            isFunctionReferenceRule: (ruleIndex, candidate) =>
                (ruleIndex === XQueryParser.RULE_functionName &&
                    candidate?.ruleList.at(-1) !== XQueryParser.RULE_functionDecl) ||
                (ruleIndex === XQueryParser.RULE_eqName &&
                    candidate?.ruleList.at(-1) === XQueryParser.RULE_arrowFunctionSpecifier),
            isObjectLookupRule: () => false,
            // Names being introduced are not keyword or reference completion sites.
            isDeclarationNameRule: (_ruleIndex, candidate) =>
                [
                    XQueryParser.RULE_functionDecl,
                    XQueryParser.RULE_varBinding,
                    XQueryParser.RULE_namespaceDecl,
                    XQueryParser.RULE_libraryModule,
                    XQueryParser.RULE_moduleImport,
                    XQueryParser.RULE_schemaPrefix,
                    XQueryParser.RULE_optionDecl,
                    XQueryParser.RULE_annotation,
                    XQueryParser.RULE_decimalFormatDecl,
                ].includes(candidate?.ruleList.at(-1) ?? -1),
            isTypeReferenceRule: (ruleIndex, candidate) =>
                ruleIndex === XQueryParser.RULE_eqName &&
                [
                    XQueryParser.RULE_itemType,
                    XQueryParser.RULE_typeName,
                    XQueryParser.RULE_typedMapTest,
                ].includes(candidate?.ruleList.at(-1) ?? -1),
            isCommentToken: (tokenType) => tokenType === XQueryLexer.XQComment,
            isLiteralXmlRule: (ruleIndex) => LITERAL_XML_RULES.has(ruleIndex),
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

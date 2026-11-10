import type { CompletionStartRule } from "server/parser/completion.js";
import { LanguageKeywordCompletion } from "server/parser/types/completion.js";

import { withGrammarKeywords } from "../common/completion-data.js";
import { XQueryLexer } from "./grammar/XQueryLexer.js";
import { XQueryParser } from "./grammar/XQueryParser.js";

export const IGNORED_COMPLETION_TOKENS = new Set([
    XQueryLexer.QUESTION,
    XQueryLexer.PLUS,
    XQueryLexer.MINUS,
    XQueryLexer.STAR,
    XQueryLexer.SLASH,
    XQueryLexer.LPAREN,
    XQueryLexer.RPAREN,
    XQueryLexer.LBRACE,
    XQueryLexer.RBRACE,
    XQueryLexer.LBRACKET,
    XQueryLexer.RBRACKET,
    XQueryLexer.MOD,
    XQueryLexer.DOT,
    XQueryLexer.BANG,
    XQueryLexer.EQUAL,
    XQueryLexer.LANGLE,
    XQueryLexer.RANGLE,
    XQueryLexer.COMMA,
]);

// Literal XML tokens are data. Embedded expressions are separate grammar alternatives.
export const LITERAL_XML_RULES = new Set([
    XQueryParser.RULE_noQuotesNoBracesNoAmpNoLAng,
    XQueryParser.RULE_dirAttributeTextQuot,
    XQueryParser.RULE_dirAttributeTextApos,
]);

export const PREFERRED_COMPLETION_RULES = new Set([
    ...LITERAL_XML_RULES,
    XQueryParser.RULE_nameTest,
    XQueryParser.RULE_varRef,
    XQueryParser.RULE_qname,
    // Not `functionCall`: c3 reports only the outermost preferred rule, so it would hide
    // the rules inside the arguments, such as `varRef` in `f($|)`.
    // Names can contain keywords; keep those paths out of syntax suggestions.
    XQueryParser.RULE_functionName,
    // Arrow function names use eqName, not functionName. Prefer the name alone
    // so variable and parenthesized arrow specifiers keep their own candidates.
    XQueryParser.RULE_eqName,
    XQueryParser.RULE_ncName,
]);

// A required continuation distinguishes syntax from a path or function with the same name.
export const COMPLETION_START_RULES = new Map<number, CompletionStartRule>([
    [
        XQueryLexer.KW_VARIABLE,
        {
            ruleIndex: XQueryParser.RULE_varBinding,
            requiredToken: XQueryLexer.DOLLAR,
            startAfterIntroducer: true,
        },
    ],
    [
        XQueryLexer.KW_FOR,
        { ruleIndex: XQueryParser.RULE_flworExpr, requiredToken: XQueryLexer.DOLLAR },
    ],
    [
        XQueryLexer.KW_LET,
        { ruleIndex: XQueryParser.RULE_flworExpr, requiredToken: XQueryLexer.DOLLAR },
    ],
    [
        XQueryLexer.KW_SOME,
        { ruleIndex: XQueryParser.RULE_quantifiedExpr, requiredToken: XQueryLexer.DOLLAR },
    ],
    [
        XQueryLexer.KW_EVERY,
        { ruleIndex: XQueryParser.RULE_quantifiedExpr, requiredToken: XQueryLexer.DOLLAR },
    ],
    [
        XQueryLexer.KW_DECLARE,
        { ruleIndex: XQueryParser.RULE_prolog, requiredToken: XQueryLexer.KW_FUNCTION },
    ],
    [
        XQueryLexer.KW_IMPORT,
        { ruleIndex: XQueryParser.RULE_prologHeader, requiredToken: XQueryLexer.KW_SCHEMA },
    ],
    [
        XQueryLexer.KW_VALIDATE,
        { ruleIndex: XQueryParser.RULE_validateExpr, requiredToken: XQueryLexer.KW_STRICT },
    ],
    [
        XQueryLexer.KW_REPLACE,
        { ruleIndex: XQueryParser.RULE_replaceExpr, requiredToken: XQueryLexer.KW_VALUE },
    ],
]);

export const KEYWORD_COMPLETIONS: LanguageKeywordCompletion[] = withGrammarKeywords(
    [
        keyword(XQueryLexer.DOLLAR),
        keyword(XQueryLexer.KW_DECLARE, "declare function", "declare function "),
        keyword(XQueryLexer.KW_DECLARE, "declare variable", "declare variable "),
        keyword(XQueryLexer.KW_IMPORT),
        keyword(XQueryLexer.KW_MODULE),
        keyword(XQueryLexer.KW_TUMBLING, "tumbling window"),
        keyword(XQueryLexer.KW_SLIDING, "sliding window"),
        keyword(XQueryLexer.KW_ONLY, "only end"),
        keyword(XQueryLexer.KW_ALLOWING, "allowing empty"),
        keyword(XQueryLexer.KW_CAST, "cast as"),
        keyword(XQueryLexer.KW_CASTABLE, "castable as"),
        keyword(XQueryLexer.KW_INSTANCE, "instance of"),
        keyword(XQueryLexer.KW_TREAT, "treat as"),
        keyword(XQueryLexer.KW_GROUP, "group by"),
        keyword(XQueryLexer.KW_ORDER, "order by"),
        keyword(XQueryLexer.KW_STABLE, "stable order by"),
    ],
    XQueryLexer.symbolicNames,
    XQueryLexer.literalNames,
);

function keyword(
    tokenType: number,
    label = tokenLabel(tokenType),
    insertText?: string,
): LanguageKeywordCompletion {
    return {
        tokenType,
        label,
        ...(insertText === undefined ? {} : { insertText }),
    };
}

function tokenLabel(tokenType: number): string {
    const literalName = XQueryLexer.literalNames[tokenType];
    if (literalName !== null && literalName !== undefined) {
        return literalName.replace(/^'|'$/g, "");
    }

    const symbolicName = XQueryLexer.symbolicNames[tokenType];
    if (symbolicName?.startsWith("KW_")) {
        return symbolicName.slice("KW_".length).toLowerCase().replaceAll("_", " ");
    }

    return symbolicName ?? tokenType.toString();
}

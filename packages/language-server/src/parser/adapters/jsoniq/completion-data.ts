import type { CompletionStartRule } from "server/parser/completion.js";
import { LanguageKeywordCompletion } from "server/parser/types/completion.js";

import { withGrammarKeywords } from "../common/completion-data.js";
import { JsoniqLexer } from "./grammar/JsoniqLexer.js";
import { JsoniqParser } from "./grammar/JsoniqParser.js";

export const IGNORED_COMPLETION_TOKENS = new Set([
    JsoniqLexer.QUESTION,
    JsoniqLexer.PLUS,
    JsoniqLexer.MINUS,
    JsoniqLexer.STAR,
    JsoniqLexer.SLASH,
    JsoniqLexer.LPAREN,
    JsoniqLexer.RPAREN,
    JsoniqLexer.LBRACE,
    JsoniqLexer.RBRACE,
    JsoniqLexer.LBRACE_VBAR,
    JsoniqLexer.RBRACE_VBAR,
    JsoniqLexer.LBRACKET,
    JsoniqLexer.RBRACKET,
    JsoniqLexer.MOD,
    JsoniqLexer.DOT,
    JsoniqLexer.BANG,
    JsoniqLexer.EQUAL,
    JsoniqLexer.LANGLE,
    JsoniqLexer.RANGLE,
    JsoniqLexer.COMMA,
]);

export const PREFERRED_COMPLETION_RULES = new Set([
    JsoniqParser.RULE_nameTest,
    JsoniqParser.RULE_varRef,
    JsoniqParser.RULE_qname,
    // Not `functionCall`: c3 reports only the outermost preferred rule, so it would hide
    // the rules inside the arguments, such as `varRef` in `f($|)`.
    // Names can contain keywords; keep those paths out of syntax suggestions.
    JsoniqParser.RULE_functionName,
    // Arrow function names use eqName, not functionName. Prefer the name alone
    // so variable and parenthesized arrow specifiers keep their own candidates.
    JsoniqParser.RULE_eqName,
    JsoniqParser.RULE_ncName,
    // Prefer only static keys so dynamic keys keep their nested reference candidates.
    JsoniqParser.RULE_objectLookupKey,
]);

// A required continuation distinguishes syntax from a path or function with the same name.
export const COMPLETION_START_RULES = new Map<number, CompletionStartRule>([
    [
        JsoniqLexer.KW_VARIABLE,
        {
            ruleIndex: JsoniqParser.RULE_varBinding,
            requiredToken: JsoniqLexer.DOLLAR,
            startAfterIntroducer: true,
        },
    ],
    [
        JsoniqLexer.KW_FOR,
        { ruleIndex: JsoniqParser.RULE_flworExpr, requiredToken: JsoniqLexer.DOLLAR },
    ],
    [
        JsoniqLexer.KW_LET,
        { ruleIndex: JsoniqParser.RULE_flworExpr, requiredToken: JsoniqLexer.DOLLAR },
    ],
    [
        JsoniqLexer.KW_SOME,
        { ruleIndex: JsoniqParser.RULE_quantifiedExpr, requiredToken: JsoniqLexer.DOLLAR },
    ],
    [
        JsoniqLexer.KW_EVERY,
        { ruleIndex: JsoniqParser.RULE_quantifiedExpr, requiredToken: JsoniqLexer.DOLLAR },
    ],
    [
        JsoniqLexer.KW_DECLARE,
        { ruleIndex: JsoniqParser.RULE_prolog, requiredToken: JsoniqLexer.KW_FUNCTION },
    ],
    [
        JsoniqLexer.KW_IMPORT,
        { ruleIndex: JsoniqParser.RULE_prologHeader, requiredToken: JsoniqLexer.KW_SCHEMA },
    ],
    [
        JsoniqLexer.KW_VALIDATE,
        { ruleIndex: JsoniqParser.RULE_validateExpr, requiredToken: JsoniqLexer.KW_STRICT },
    ],
    [
        JsoniqLexer.KW_REPLACE,
        { ruleIndex: JsoniqParser.RULE_replaceExpr, requiredToken: JsoniqLexer.KW_VALUE },
    ],
    [
        JsoniqLexer.KW_INSERT,
        { ruleIndex: JsoniqParser.RULE_exprSimple, requiredToken: JsoniqLexer.KW_JSON },
    ],
]);

export const KEYWORD_COMPLETIONS: LanguageKeywordCompletion[] = withGrammarKeywords(
    [
        createLanguageKeyword(JsoniqLexer.DOLLAR),
        createLanguageKeyword(JsoniqLexer.KW_DECLARE, "declare function", "declare function "),
        createLanguageKeyword(JsoniqLexer.KW_DECLARE, "declare variable", "declare variable "),
        createLanguageKeyword(JsoniqLexer.KW_IMPORT),
        createLanguageKeyword(JsoniqLexer.KW_JSONIQ, "jsoniq version"),
        createLanguageKeyword(JsoniqLexer.KW_MODULE),
        createLanguageKeyword(JsoniqLexer.KW_TUMBLING, "tumbling window"),
        createLanguageKeyword(JsoniqLexer.KW_SLIDING, "sliding window"),
        createLanguageKeyword(JsoniqLexer.KW_ONLY, "only end"),
        createLanguageKeyword(JsoniqLexer.KW_ALLOWING, "allowing empty"),
        createLanguageKeyword(JsoniqLexer.KW_CAST, "cast as"),
        createLanguageKeyword(JsoniqLexer.KW_CASTABLE, "castable as"),
        createLanguageKeyword(JsoniqLexer.KW_INSTANCE, "instance of"),
        createLanguageKeyword(JsoniqLexer.KW_TREAT, "treat as"),
        createLanguageKeyword(JsoniqLexer.KW_GROUP, "group by"),
        createLanguageKeyword(JsoniqLexer.KW_ORDER, "order by"),
        createLanguageKeyword(JsoniqLexer.KW_STABLE, "stable order by"),
    ],
    JsoniqLexer.symbolicNames,
    JsoniqLexer.literalNames,
);

function createLanguageKeyword(
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
    const literalName = JsoniqLexer.literalNames[tokenType];
    if (literalName !== null && literalName !== undefined) {
        return literalName.replace(/^'|'$/g, "");
    }

    const symbolicName = JsoniqLexer.symbolicNames[tokenType];
    if (symbolicName?.startsWith("KW_")) {
        return symbolicName.slice("KW_".length).toLowerCase().replaceAll("_", " ");
    }

    return symbolicName ?? tokenType.toString();
}

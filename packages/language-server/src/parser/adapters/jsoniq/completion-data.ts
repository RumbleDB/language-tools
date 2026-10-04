import { LanguageKeywordCompletion } from "server/parser/types/completion.js";

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
    JsoniqParser.RULE_functionCall,
    // Names can contain keywords; keep those paths out of syntax suggestions.
    JsoniqParser.RULE_functionName,
    JsoniqParser.RULE_ncName,
    JsoniqParser.RULE_objectLookup,
]);

// Prefer query clauses when their opening keyword is also a legal name.
export const CLAUSE_START_RULES = new Map([
    [JsoniqLexer.KW_FOR, JsoniqParser.RULE_flworExpr],
    [JsoniqLexer.KW_LET, JsoniqParser.RULE_flworExpr],
    [JsoniqLexer.KW_SOME, JsoniqParser.RULE_quantifiedExpr],
    [JsoniqLexer.KW_EVERY, JsoniqParser.RULE_quantifiedExpr],
]);

export const KEYWORD_COMPLETIONS: LanguageKeywordCompletion[] = [
    createLanguageKeyword(JsoniqLexer.DOLLAR),
    ...[
        JsoniqLexer.KW_EVERY,
        JsoniqLexer.KW_FOR,
        JsoniqLexer.KW_IF,
        JsoniqLexer.KW_LET,
        JsoniqLexer.KW_SOME,
        JsoniqLexer.KW_SWITCH,
        JsoniqLexer.KW_TRY,
        JsoniqLexer.KW_TYPESWITCH,
        JsoniqLexer.KW_TRUE,
        JsoniqLexer.KW_FALSE,
    ].map((tokenType) => createLanguageKeyword(tokenType)),
    createLanguageKeyword(JsoniqLexer.KW_ORDERED),
    createLanguageKeyword(JsoniqLexer.KW_UNORDERED),
    createLanguageKeyword(JsoniqLexer.KW_NULL, "null"),
    prologKeyword(JsoniqLexer.KW_DECLARE, "declare function", "declare function "),
    prologKeyword(JsoniqLexer.KW_DECLARE, "declare variable", "declare variable "),
    prologKeyword(JsoniqLexer.KW_IMPORT),
    prologKeyword(JsoniqLexer.KW_JSONIQ, "jsoniq version"),
    prologKeyword(JsoniqLexer.KW_MODULE),
    ...[
        JsoniqLexer.KW_AND,
        JsoniqLexer.KW_AS,
        JsoniqLexer.KW_ASCENDING,
        JsoniqLexer.KW_AT,
        JsoniqLexer.KW_BY,
        JsoniqLexer.KW_CASE,
        JsoniqLexer.KW_CATCH,
        JsoniqLexer.KW_COUNT,
        JsoniqLexer.KW_COLLATION,
        JsoniqLexer.KW_DEFAULT,
        JsoniqLexer.KW_DESCENDING,
        JsoniqLexer.KW_DIV,
        JsoniqLexer.KW_ELSE,
        JsoniqLexer.KW_EMPTY,
        JsoniqLexer.KW_EQ,
        JsoniqLexer.KW_EXCEPT,
        JsoniqLexer.KW_GE,
        JsoniqLexer.KW_GREATEST,
        JsoniqLexer.KW_GT,
        JsoniqLexer.KW_IDIV,
        JsoniqLexer.KW_IN,
        JsoniqLexer.KW_INTERSECT,
        JsoniqLexer.KW_IS,
        JsoniqLexer.KW_LE,
        JsoniqLexer.KW_LEAST,
        JsoniqLexer.KW_LT,
        JsoniqLexer.KW_MOD,
        JsoniqLexer.KW_NAMESPACE,
        JsoniqLexer.KW_NE,
        JsoniqLexer.KW_NOT,
        JsoniqLexer.KW_OF,
        JsoniqLexer.KW_OR,
        JsoniqLexer.KW_RETURN,
        JsoniqLexer.KW_SATISFIES,
        JsoniqLexer.KW_THEN,
        JsoniqLexer.KW_TO,
        JsoniqLexer.KW_UNION,
        JsoniqLexer.KW_VALIDATE,
        JsoniqLexer.KW_WHERE,
        JsoniqLexer.KW_WINDOW,
        JsoniqLexer.KW_START,
        JsoniqLexer.KW_WHEN,
        JsoniqLexer.KW_END,
        JsoniqLexer.KW_PREVIOUS,
        JsoniqLexer.KW_NEXT,
    ].map((tokenType) => createLanguageKeyword(tokenType)),
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
];

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

function prologKeyword(
    tokenType: number,
    label = tokenLabel(tokenType),
    insertText?: string,
): LanguageKeywordCompletion {
    return {
        ...createLanguageKeyword(tokenType, label, insertText),
        prologOnly: true,
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

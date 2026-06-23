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
    JsoniqLexer.KW_OR,
    JsoniqLexer.KW_NOT,
    JsoniqLexer.LANGLE,
    JsoniqLexer.RANGLE,
    JsoniqLexer.COMMA,
]);

export const PREFERRED_COMPLETION_RULES = new Set([
    JsoniqParser.RULE_varRef,
    JsoniqParser.RULE_qname,
    JsoniqParser.RULE_functionCall,
    JsoniqParser.RULE_objectLookup,
]);

export const KEYWORD_COMPLETIONS: LanguageKeywordCompletion[] = [
    ...[
        JsoniqLexer.KW_COPY,
        JsoniqLexer.KW_DELETE,
        JsoniqLexer.KW_EDIT,
        JsoniqLexer.KW_EVERY,
        JsoniqLexer.KW_FOR,
        JsoniqLexer.KW_IF,
        JsoniqLexer.KW_INSERT,
        JsoniqLexer.KW_LET,
        JsoniqLexer.KW_SOME,
        JsoniqLexer.KW_SWITCH,
        JsoniqLexer.KW_TRY,
        JsoniqLexer.KW_TYPESWITCH,
        JsoniqLexer.KW_TRUE,
        JsoniqLexer.KW_FALSE,
    ].map((tokenType) => createLanguageKeyword(tokenType)),
    createLanguageKeyword(JsoniqLexer.KW_APPEND),
    createLanguageKeyword(JsoniqLexer.KW_CREATE),
    createLanguageKeyword(JsoniqLexer.KW_ORDERED),
    createLanguageKeyword(JsoniqLexer.KW_RENAME),
    createLanguageKeyword(JsoniqLexer.KW_REPLACE),
    createLanguageKeyword(JsoniqLexer.KW_TRUNCATE),
    createLanguageKeyword(JsoniqLexer.KW_UNORDERED),
    createLanguageKeyword(JsoniqLexer.KW_NULL, "null"),
    prologKeyword(JsoniqLexer.KW_DECLARE, "declare function", "declare function "),
    prologKeyword(JsoniqLexer.KW_DECLARE, "declare variable", "declare variable "),
    prologKeyword(JsoniqLexer.KW_IMPORT),
    prologKeyword(JsoniqLexer.KW_JSONIQ, "jsoniq version"),
    prologKeyword(JsoniqLexer.KW_MODULE),
    createLanguageKeyword(JsoniqLexer.KW_BREAK, "break loop"),
    createLanguageKeyword(JsoniqLexer.KW_CONTINUE, "continue"),
    createLanguageKeyword(JsoniqLexer.KW_EXIT, "exit returning"),
    createLanguageKeyword(JsoniqLexer.KW_VARIABLE),
    createLanguageKeyword(JsoniqLexer.KW_WHILE),
    ...[
        JsoniqLexer.KW_ALLOWING,
        JsoniqLexer.KW_AS,
        JsoniqLexer.KW_AT,
        JsoniqLexer.KW_CASE,
        JsoniqLexer.KW_CATCH,
        JsoniqLexer.KW_COUNT,
        JsoniqLexer.KW_DEFAULT,
        JsoniqLexer.KW_ELSE,
        JsoniqLexer.KW_IN,
        JsoniqLexer.KW_NAMESPACE,
        JsoniqLexer.KW_RETURN,
        JsoniqLexer.KW_THEN,
        JsoniqLexer.KW_VALIDATE,
        JsoniqLexer.KW_WHERE,
    ].map((tokenType) => createLanguageKeyword(tokenType)),
    createLanguageKeyword(JsoniqLexer.KW_GROUP, "group by"),
    createLanguageKeyword(JsoniqLexer.KW_ORDER, "order by"),
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

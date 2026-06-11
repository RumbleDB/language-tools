import { JsoniqLexer } from "./grammar/JsoniqLexer.js";
import { JsoniqParser } from "./grammar/JsoniqParser.js";

export interface KeywordCompletion {
    tokenType: number;
    label: string;
    insertText?: string;
    prologOnly?: boolean;
}

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
]);

export const KEYWORD_COMPLETIONS: KeywordCompletion[] = [
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
    ].map((tokenType) => keyword(tokenType)),
    keyword(JsoniqLexer.KW_APPEND),
    keyword(JsoniqLexer.KW_CREATE),
    keyword(JsoniqLexer.KW_ORDERED),
    keyword(JsoniqLexer.KW_RENAME),
    keyword(JsoniqLexer.KW_REPLACE),
    keyword(JsoniqLexer.KW_TRUNCATE),
    keyword(JsoniqLexer.KW_UNORDERED),
    keyword(JsoniqLexer.KW_NULL, "null"),
    prologKeyword(JsoniqLexer.KW_DECLARE, "declare function", "declare function "),
    prologKeyword(JsoniqLexer.KW_DECLARE, "declare variable", "declare variable "),
    prologKeyword(JsoniqLexer.KW_IMPORT),
    prologKeyword(JsoniqLexer.KW_JSONIQ, "jsoniq version"),
    prologKeyword(JsoniqLexer.KW_MODULE),
    keyword(JsoniqLexer.KW_BREAK, "break loop"),
    keyword(JsoniqLexer.KW_CONTINUE, "continue"),
    keyword(JsoniqLexer.KW_EXIT, "exit returning"),
    keyword(JsoniqLexer.KW_VARIABLE),
    keyword(JsoniqLexer.KW_WHILE),
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
    ].map((tokenType) => keyword(tokenType)),
    keyword(JsoniqLexer.KW_GROUP, "group by"),
    keyword(JsoniqLexer.KW_ORDER, "order by"),
];

function keyword(
    tokenType: number,
    label = tokenLabel(tokenType),
    insertText?: string,
): KeywordCompletion {
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
): KeywordCompletion {
    return {
        ...keyword(tokenType, label, insertText),
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

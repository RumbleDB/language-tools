import { LanguageKeywordCompletion } from "server/parser/types/completion.js";

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

export const PREFERRED_COMPLETION_RULES = new Set([
    XQueryParser.RULE_nameTest,
    XQueryParser.RULE_varRef,
    XQueryParser.RULE_qname,
    XQueryParser.RULE_functionCall,
    // Names can contain keywords; keep those paths out of syntax suggestions.
    XQueryParser.RULE_functionName,
    XQueryParser.RULE_ncName,
]);

export const KEYWORD_COMPLETIONS: LanguageKeywordCompletion[] = [
    ...[
        XQueryLexer.KW_EVERY,
        XQueryLexer.KW_FOR,
        XQueryLexer.KW_IF,
        XQueryLexer.KW_LET,
        XQueryLexer.KW_SOME,
        XQueryLexer.KW_SWITCH,
        XQueryLexer.KW_TRY,
        XQueryLexer.KW_TYPESWITCH,
    ].map((tokenType) => keyword(tokenType)),
    keyword(XQueryLexer.KW_ORDERED),
    keyword(XQueryLexer.KW_UNORDERED),
    prologKeyword(XQueryLexer.KW_DECLARE, "declare function", "declare function "),
    prologKeyword(XQueryLexer.KW_DECLARE, "declare variable", "declare variable "),
    prologKeyword(XQueryLexer.KW_IMPORT),
    prologKeyword(XQueryLexer.KW_MODULE),
    ...[
        XQueryLexer.KW_AND,
        XQueryLexer.KW_AS,
        XQueryLexer.KW_ASCENDING,
        XQueryLexer.KW_AT,
        XQueryLexer.KW_BY,
        XQueryLexer.KW_CASE,
        XQueryLexer.KW_CATCH,
        XQueryLexer.KW_COUNT,
        XQueryLexer.KW_COLLATION,
        XQueryLexer.KW_DEFAULT,
        XQueryLexer.KW_DESCENDING,
        XQueryLexer.KW_DIV,
        XQueryLexer.KW_ELSE,
        XQueryLexer.KW_EMPTY,
        XQueryLexer.KW_EQ,
        XQueryLexer.KW_EXCEPT,
        XQueryLexer.KW_GE,
        XQueryLexer.KW_GREATEST,
        XQueryLexer.KW_GT,
        XQueryLexer.KW_IDIV,
        XQueryLexer.KW_IN,
        XQueryLexer.KW_INTERSECT,
        XQueryLexer.KW_IS,
        XQueryLexer.KW_LE,
        XQueryLexer.KW_LEAST,
        XQueryLexer.KW_LT,
        XQueryLexer.KW_MOD,
        XQueryLexer.KW_NAMESPACE,
        XQueryLexer.KW_NE,
        XQueryLexer.KW_OF,
        XQueryLexer.KW_OR,
        XQueryLexer.KW_RETURN,
        XQueryLexer.KW_SATISFIES,
        XQueryLexer.KW_THEN,
        XQueryLexer.KW_TO,
        XQueryLexer.KW_UNION,
        XQueryLexer.KW_VALIDATE,
        XQueryLexer.KW_WHERE,
    ].map((tokenType) => keyword(tokenType)),
    keyword(XQueryLexer.KW_ALLOWING, "allowing empty"),
    keyword(XQueryLexer.KW_CAST, "cast as"),
    keyword(XQueryLexer.KW_CASTABLE, "castable as"),
    keyword(XQueryLexer.KW_INSTANCE, "instance of"),
    keyword(XQueryLexer.KW_TREAT, "treat as"),
    keyword(XQueryLexer.KW_GROUP, "group by"),
    keyword(XQueryLexer.KW_ORDER, "order by"),
    keyword(XQueryLexer.KW_STABLE, "stable order by"),
];

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

function prologKeyword(
    tokenType: number,
    label = tokenLabel(tokenType),
    insertText?: string,
): LanguageKeywordCompletion {
    return {
        ...keyword(tokenType, label, insertText),
        prologOnly: true,
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

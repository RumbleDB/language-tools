import { XQueryLexer } from "./grammar/XQueryLexer.js";
import { XQueryParser } from "./grammar/XQueryParser.js";

interface KeywordCompletion {
    tokenType: number;
    label: string;
    insertText?: string;
    prologOnly?: boolean;
}

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
    // XQueryLexer.LBRACE_VBAR,
    // XQueryLexer.RBRACE_VBAR,
    XQueryLexer.LBRACKET,
    XQueryLexer.RBRACKET,
    XQueryLexer.MOD,
    XQueryLexer.DOT,
    XQueryLexer.BANG,
    XQueryLexer.EQUAL,
    XQueryLexer.KW_OR,
    // XQueryLexer.KW_NOT,
    XQueryLexer.LANGLE,
    XQueryLexer.RANGLE,
    XQueryLexer.COMMA,
]);

export const PREFERRED_COMPLETION_RULES = new Set([
    XQueryParser.RULE_varRef,
    XQueryParser.RULE_qname,
    XQueryParser.RULE_functionCall,
]);

export const KEYWORD_COMPLETIONS: KeywordCompletion[] = [
    ...[
        XQueryLexer.KW_COPY,
        XQueryLexer.KW_DELETE,
        XQueryLexer.KW_EDIT,
        XQueryLexer.KW_EVERY,
        XQueryLexer.KW_FOR,
        XQueryLexer.KW_IF,
        XQueryLexer.KW_INSERT,
        XQueryLexer.KW_LET,
        XQueryLexer.KW_SOME,
        XQueryLexer.KW_SWITCH,
        XQueryLexer.KW_TRY,
        XQueryLexer.KW_TYPESWITCH,
        // XQueryLexer.KW_TRUE,
        // XQueryLexer.KW_FALSE,
    ].map((tokenType) => keyword(tokenType)),
    keyword(XQueryLexer.KW_APPEND),
    keyword(XQueryLexer.KW_CREATE),
    keyword(XQueryLexer.KW_ORDERED),
    keyword(XQueryLexer.KW_RENAME),
    keyword(XQueryLexer.KW_REPLACE),
    keyword(XQueryLexer.KW_TRUNCATE),
    keyword(XQueryLexer.KW_UNORDERED),
    // keyword(XQueryLexer.KW_NULL, "null"),
    prologKeyword(XQueryLexer.KW_DECLARE, "declare function", "declare function "),
    prologKeyword(XQueryLexer.KW_DECLARE, "declare variable", "declare variable "),
    prologKeyword(XQueryLexer.KW_IMPORT),
    // prologKeyword(XQueryLexer.KW_JSONIQ, "jsoniq version"),
    prologKeyword(XQueryLexer.KW_MODULE),
    keyword(XQueryLexer.KW_BREAK, "break loop"),
    keyword(XQueryLexer.KW_CONTINUE, "continue"),
    keyword(XQueryLexer.KW_EXIT, "exit returning"),
    keyword(XQueryLexer.KW_VARIABLE),
    keyword(XQueryLexer.KW_WHILE),
    ...[
        XQueryLexer.KW_ALLOWING,
        XQueryLexer.KW_AS,
        XQueryLexer.KW_AT,
        XQueryLexer.KW_CASE,
        XQueryLexer.KW_CATCH,
        XQueryLexer.KW_COUNT,
        XQueryLexer.KW_DEFAULT,
        XQueryLexer.KW_ELSE,
        XQueryLexer.KW_IN,
        XQueryLexer.KW_NAMESPACE,
        XQueryLexer.KW_RETURN,
        XQueryLexer.KW_THEN,
        XQueryLexer.KW_VALIDATE,
        XQueryLexer.KW_WHERE,
    ].map((tokenType) => keyword(tokenType)),
    keyword(XQueryLexer.KW_GROUP, "group by"),
    keyword(XQueryLexer.KW_ORDER, "order by"),
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

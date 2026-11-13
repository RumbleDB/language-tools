import type { Token } from "antlr4ng";
import { TokenContextAnalyzer } from "server/parser/completion-context.js";
import { getCompletionIntent, type CompletionStartRule } from "server/parser/completion.js";
import { parseDocument } from "server/parser/shared/parse.js";
import type { ParserAdapter } from "server/parser/types/adapter.js";
import type { LanguageKeywordCompletion } from "server/parser/types/completion.js";
import { getActiveParserId } from "server/parser/utils.js";

import type { JsoniqLexer } from "../jsoniq/grammar/JsoniqLexer.js";
import type { JsoniqParser } from "../jsoniq/grammar/JsoniqParser.js";
import type { XQueryLexer } from "../xquery/grammar/XQueryLexer.js";
import type { XQueryParser } from "../xquery/grammar/XQueryParser.js";

/** A keyword offered as written, such as `order by`, and the text it inserts when that differs. */
type Keyword = readonly [tokenType: number, label?: string, insertText?: string];

/**
 * A language: its generated lexer and parser, and the syntax only it has. Both grammars build on the same rules, so
 * the rest of the parsing and completion setup is shared, looked up by name in each grammar.
 */
export interface LanguageGrammar {
    readonly id: "jsoniq" | "xquery";
    readonly lexer: typeof JsoniqLexer | typeof XQueryLexer;
    readonly parser: typeof JsoniqParser | typeof XQueryParser;
    /** Punctuation that completion never suggests, besides the shared punctuation. */
    readonly ignoredTokens?: readonly number[];
    /** Keywords offered where an expression can start, besides the shared ones. */
    readonly expressionKeywords?: readonly number[];
    /** Compound keywords, besides the shared ones. */
    readonly keywords?: readonly Keyword[];
    /** Rules that introduce a name, where neither keywords nor references are offered. */
    readonly declarationRules?: readonly number[];
    /** The key after `.` in an object lookup, which offers the keys of the object. */
    readonly objectLookupRule?: number;
}

export function createParserAdapter(grammar: LanguageGrammar): ParserAdapter {
    const { id, lexer: Lexer, parser: Parser } = grammar;

    class LanguageTokenContextAnalyzer extends TokenContextAnalyzer {
        protected override get ncNameTokenType(): number {
            return Lexer.NCName;
        }

        protected override get colonTokenType(): number {
            return Lexer.COLON;
        }

        protected override get dollarTokenType(): number {
            return Lexer.DOLLAR;
        }

        protected override get lexerSymbolicNames(): ReadonlyArray<string | null> {
            return Lexer.symbolicNames;
        }
    }

    // Literal XML tokens are data. Embedded expressions are separate grammar alternatives.
    const literalXmlRules = new Set([
        Parser.RULE_noQuotesNoBracesNoAmpNoLAng,
        Parser.RULE_dirAttributeTextQuot,
        Parser.RULE_dirAttributeTextApos,
    ]);

    const options = {
        tokenContextAnalyzer: LanguageTokenContextAnalyzer as new (
            tokens: Token[],
            cursorOffset: number,
        ) => TokenContextAnalyzer,
        ignoredTokens: new Set([
            Lexer.QUESTION,
            Lexer.PLUS,
            Lexer.MINUS,
            Lexer.STAR,
            Lexer.SLASH,
            Lexer.LPAREN,
            Lexer.RPAREN,
            Lexer.LBRACE,
            Lexer.RBRACE,
            Lexer.LBRACKET,
            Lexer.RBRACKET,
            Lexer.MOD,
            Lexer.DOT,
            Lexer.BANG,
            Lexer.EQUAL,
            Lexer.LANGLE,
            Lexer.RANGLE,
            Lexer.COMMA,
            ...(grammar.ignoredTokens ?? []),
        ]),
        // A required continuation distinguishes syntax from a path or function with the same name.
        completionStartRules: new Map<number, CompletionStartRule>([
            [
                Lexer.KW_VARIABLE,
                {
                    ruleIndex: Parser.RULE_varBinding,
                    requiredToken: Lexer.DOLLAR,
                    startAfterIntroducer: true,
                },
            ],
            [Lexer.KW_FOR, { ruleIndex: Parser.RULE_flworExpr, requiredToken: Lexer.DOLLAR }],
            [Lexer.KW_LET, { ruleIndex: Parser.RULE_flworExpr, requiredToken: Lexer.DOLLAR }],
            [Lexer.KW_SOME, { ruleIndex: Parser.RULE_quantifiedExpr, requiredToken: Lexer.DOLLAR }],
            [
                Lexer.KW_EVERY,
                { ruleIndex: Parser.RULE_quantifiedExpr, requiredToken: Lexer.DOLLAR },
            ],
            [Lexer.KW_DECLARE, { ruleIndex: Parser.RULE_prolog, requiredToken: Lexer.KW_FUNCTION }],
            [
                Lexer.KW_IMPORT,
                { ruleIndex: Parser.RULE_prologHeader, requiredToken: Lexer.KW_SCHEMA },
            ],
            [
                Lexer.KW_VALIDATE,
                { ruleIndex: Parser.RULE_validateExpr, requiredToken: Lexer.KW_STRICT },
            ],
            [
                Lexer.KW_REPLACE,
                { ruleIndex: Parser.RULE_replaceExpr, requiredToken: Lexer.KW_VALUE },
            ],
        ]),
        preferredRules: new Set([
            ...literalXmlRules,
            Parser.RULE_nameTest,
            Parser.RULE_varRef,
            Parser.RULE_qname,
            // Not `functionCall`: c3 reports only the outermost preferred rule, so it would hide
            // the rules inside the arguments, such as `varRef` in `f($|)`.
            // Names can contain keywords; keep those paths out of syntax suggestions.
            Parser.RULE_functionName,
            // Arrow function names use eqName, not functionName. Prefer the name alone
            // so variable and parenthesized arrow specifiers keep their own candidates.
            Parser.RULE_eqName,
            Parser.RULE_ncName,
            // Prefer only static keys so dynamic keys keep their nested reference candidates.
            ...(grammar.objectLookupRule === undefined ? [] : [grammar.objectLookupRule]),
        ]),
        languageKeywords: withGrammarKeywords(Lexer, [
            [Lexer.DOLLAR],
            [Lexer.KW_DECLARE, "declare function", "declare function "],
            [Lexer.KW_DECLARE, "declare variable", "declare variable "],
            [Lexer.KW_IMPORT],
            ...(grammar.keywords ?? []),
            [Lexer.KW_MODULE],
            [Lexer.KW_TUMBLING, "tumbling window"],
            [Lexer.KW_SLIDING, "sliding window"],
            [Lexer.KW_ONLY, "only end"],
            [Lexer.KW_ALLOWING, "allowing empty"],
            [Lexer.KW_CAST, "cast as"],
            [Lexer.KW_CASTABLE, "castable as"],
            [Lexer.KW_INSTANCE, "instance of"],
            [Lexer.KW_TREAT, "treat as"],
            [Lexer.KW_GROUP, "group by"],
            [Lexer.KW_ORDER, "order by"],
            [Lexer.KW_STABLE, "stable order by"],
        ]),
        // Where an expression can start, the grammar also allows axes, kind tests, constructors and statements.
        // They are rarely typed there as keywords, so offer only these, which start an expression or follow one.
        expressionKeywords: new Set([
            Lexer.DOLLAR,
            Lexer.KW_EVERY,
            Lexer.KW_FOR,
            Lexer.KW_IF,
            Lexer.KW_LET,
            Lexer.KW_SOME,
            Lexer.KW_SWITCH,
            Lexer.KW_TRY,
            Lexer.KW_TYPESWITCH,
            Lexer.KW_ORDERED,
            Lexer.KW_UNORDERED,
            Lexer.KW_NAMESPACE,
            Lexer.KW_VALIDATE,
            Lexer.KW_DECLARE,
            Lexer.KW_IMPORT,
            Lexer.KW_MODULE,
            Lexer.KW_COPY,
            Lexer.KW_DELETE,
            Lexer.KW_INSERT,
            Lexer.KW_RENAME,
            Lexer.KW_REPLACE,
            Lexer.KW_APPEND,
            Lexer.KW_STATICALLY,
            Lexer.KW_JSON,
            ...(grammar.expressionKeywords ?? []),
        ]),
        // Calls and named function references; a declaration introduces its name instead.
        isFunctionReferenceRule: (ruleIndex: number, candidate?: { ruleList: number[] }) =>
            ruleIndex === Parser.RULE_functionName &&
            candidate?.ruleList.at(-1) !== Parser.RULE_functionDecl,
        // Arrow function names use eqName, not functionName.
        isArrowFunctionRule: (ruleIndex: number, candidate?: { ruleList: number[] }) =>
            ruleIndex === Parser.RULE_eqName &&
            candidate?.ruleList.at(-1) === Parser.RULE_arrowFunctionSpecifier,
        isObjectLookupRule: (ruleIndex: number) => ruleIndex === grammar.objectLookupRule,
        // Names being introduced are not keyword or reference completion sites.
        isDeclarationNameRule: (_ruleIndex: number, candidate?: { ruleList: number[] }) =>
            [
                Parser.RULE_functionDecl,
                Parser.RULE_varBinding,
                Parser.RULE_namespaceDecl,
                Parser.RULE_libraryModule,
                Parser.RULE_moduleImport,
                Parser.RULE_schemaPrefix,
                Parser.RULE_optionDecl,
                Parser.RULE_annotation,
                Parser.RULE_decimalFormatDecl,
                ...(grammar.declarationRules ?? []),
            ].includes(candidate?.ruleList.at(-1) ?? -1),
        isTypeReferenceRule: (ruleIndex: number, candidate?: { ruleList: number[] }) =>
            ruleIndex === Parser.RULE_eqName &&
            [Parser.RULE_itemType, Parser.RULE_typeName, Parser.RULE_typedMapTest].includes(
                candidate?.ruleList.at(-1) ?? -1,
            ),
        isCommentToken: (tokenType: number) => tokenType === Lexer.XQComment,
        isLiteralXmlRule: (ruleIndex: number) => literalXmlRules.has(ruleIndex),
        isStringLiteralRule: (ruleIndex: number) => ruleIndex === Parser.RULE_stringLiteral,
        isCatchErrorTargetRule: (ruleIndex: number, candidate?: { ruleList: number[] }) =>
            ruleIndex === Parser.RULE_nameTest &&
            (candidate?.ruleList.includes(Parser.RULE_catchClause) === true ||
                candidate?.ruleList.includes(Parser.RULE_catchCaseStatement) === true),
        isVariableReferenceRule: (ruleIndex: number) => ruleIndex === Parser.RULE_varRef,
        tokenName: (tokenType: number) => Parser.symbolicNames[tokenType] ?? tokenType,
        ruleName: (ruleIndex: number) => Parser.ruleNames[ruleIndex] ?? ruleIndex,
    };

    return {
        id,
        supports: (document) => getActiveParserId(document) === id,
        parse: (document) => parseDocument(document, { lexer: Lexer, parser: Parser }),
        getCompletionIntent: (parsed, cursorOffset) =>
            getCompletionIntent(parsed, cursorOffset, options),
    };
}

/** The text of a token as it is written: its literal, or the words of its keyword name. */
function tokenLabel(lexer: LanguageGrammar["lexer"], tokenType: number): string {
    const literalName = lexer.literalNames[tokenType];
    if (literalName != null) return literalName.replace(/^'|'$/g, "");

    const symbolicName = lexer.symbolicNames[tokenType];
    return symbolicName?.startsWith("KW_")
        ? symbolicName.slice("KW_".length).toLowerCase().replaceAll("_", " ")
        : (symbolicName ?? tokenType.toString());
}

/**
 * The configured keywords, followed by every other keyword of the grammar, so that the catalog stays in sync with the
 * lexer. C3 decides which keywords fit where.
 */
function withGrammarKeywords(
    lexer: LanguageGrammar["lexer"],
    keywords: readonly Keyword[],
): LanguageKeywordCompletion[] {
    const completions: LanguageKeywordCompletion[] = keywords.map(
        ([tokenType, label = tokenLabel(lexer, tokenType), insertText]) => ({
            tokenType,
            label,
            ...(insertText === undefined ? {} : { insertText }),
        }),
    );
    const configured = new Set(completions.map((item) => item.tokenType));
    for (const [tokenType, symbolicName] of lexer.symbolicNames.entries()) {
        if (symbolicName?.startsWith("KW_") && !configured.has(tokenType)) {
            completions.push({ tokenType, label: tokenLabel(lexer, tokenType) });
        }
    }
    return completions.map((item) => {
        if (!item.label.includes(" ") || item.insertText !== undefined) return item;
        const followingTokens = item.label
            .split(" ")
            .slice(1)
            .map((word) => lexer.literalNames.indexOf(`'${word}'`));
        return { ...item, followingTokens, fallbackLabel: tokenLabel(lexer, item.tokenType) };
    });
}

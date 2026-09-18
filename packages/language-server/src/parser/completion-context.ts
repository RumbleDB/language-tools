import { Token } from "antlr4ng";

import { CompletionTokenContext } from "./types/completion.js";

const DEFAULT_CONTEXT: CompletionTokenContext = {
    kind: "default",
    allowKeywords: true,
    allowPrologKeywords: false,
    allowReferences: true,
    allowTypeReferences: false,
    allowVariableDeclarations: false,
    qnamePrefix: false,
};

const FUNCTION_NAME_CONTEXT: CompletionTokenContext = {
    kind: "function-name",
    allowKeywords: false,
    allowPrologKeywords: false,
    allowReferences: false,
    allowTypeReferences: false,
    allowVariableDeclarations: false,
    qnamePrefix: false,
};

const TYPE_NAME_CONTEXT: CompletionTokenContext = {
    kind: "type-name",
    allowKeywords: false,
    allowPrologKeywords: false,
    allowReferences: false,
    allowTypeReferences: true,
    allowVariableDeclarations: false,
    qnamePrefix: false,
};

const TOP_LEVEL_PROLOG_CONTEXT: CompletionTokenContext = {
    kind: "top-level-prolog",
    allowKeywords: true,
    allowPrologKeywords: true,
    allowReferences: true,
    allowTypeReferences: false,
    allowVariableDeclarations: false,
    qnamePrefix: false,
};

const VARIABLE_DECLARATION_CONTEXT: CompletionTokenContext = {
    kind: "variable-declaration",
    allowKeywords: false,
    allowPrologKeywords: false,
    allowReferences: false,
    allowTypeReferences: false,
    allowVariableDeclarations: true,
    qnamePrefix: false,
};

export {
    DEFAULT_CONTEXT,
    FUNCTION_NAME_CONTEXT,
    TYPE_NAME_CONTEXT,
    TOP_LEVEL_PROLOG_CONTEXT,
    VARIABLE_DECLARATION_CONTEXT,
};

export abstract class TokenContextAnalyzer {
    protected readonly tokensBeforeCursor: Token[];

    public constructor(tokens: Token[], cursorOffset: number) {
        this.tokensBeforeCursor = tokens.filter(
            (token) =>
                token.type !== Token.EOF &&
                (token.channel ?? Token.DEFAULT_CHANNEL) === Token.DEFAULT_CHANNEL &&
                token.start < cursorOffset,
        );
    }

    public abstract isAfterDeclareFunction(): boolean;
    public abstract isAtVariableDeclarationName(): boolean;
    public abstract isAtTopLevelProlog(): boolean;

    /**
     * Returns true when the last two real tokens before the cursor are an NCName-like
     * token immediately followed by a COLON — i.e. the user has typed something like
     * `fn:` and the lexer has not yet produced a valid FullQName.
     *
     * Guards against `$a:` (variable name with colon) by checking for a DOLLAR token
     * at position -3.
     */
    public isAfterQNamePrefix(): boolean {
        if (this.previous?.type !== this.colonTokenType) {
            return false;
        }
        // `$a:` is a variable name, not a QName prefix
        if (this.tokensBeforeCursor.at(-3)?.type === this.dollarTokenType) {
            return false;
        }
        return this.isNCNameOrKeyword(this.beforePrevious);
    }

    /**
     * Returns true when the cursor is at a position where a type name is expected.
     * Handles three cases:
     * - `as |`      → previous = KW_AS
     * - `as foo|`   → previous = NCName/keyword, beforePrevious = KW_AS
     * - `as xs:|`   → previous = COLON, at(-2) = NCName/keyword, at(-3) = KW_AS
     */
    public isAtTypeName(): boolean {
        if (this.previous?.type === this.kwAsTokenType) {
            return true;
        }
        if (this.beforePreviousIs(this.kwAsTokenType)) {
            return true;
        }
        if (
            this.previous?.type === this.colonTokenType &&
            this.tokensBeforeCursor.at(-3)?.type === this.kwAsTokenType &&
            this.isNCNameOrKeyword(this.beforePrevious)
        ) {
            return true;
        }
        return false;
    }

    protected get previous(): Token | undefined {
        return this.tokensBeforeCursor.at(-1);
    }

    protected get beforePrevious(): Token | undefined {
        return this.tokensBeforeCursor.at(-2);
    }

    protected beforePreviousIs(tokenType: number): boolean {
        return this.beforePrevious?.type === tokenType;
    }

    protected lastIndexOf(tokenType: number): number {
        for (let index = this.tokensBeforeCursor.length - 1; index >= 0; index -= 1) {
            if (this.tokensBeforeCursor[index]?.type === tokenType) {
                return index;
            }
        }

        return -1;
    }

    /** Token type for a bare NCName in this grammar (e.g. `JsoniqLexer.NCName`). */
    protected abstract get ncNameTokenType(): number;

    /** Token type for `:` in this grammar (e.g. `JsoniqLexer.COLON`). */
    protected abstract get colonTokenType(): number;

    /** Token type for `$` in this grammar (e.g. `JsoniqLexer.DOLLAR`). */
    protected abstract get dollarTokenType(): number;

    /** Token type for the `as` keyword in this grammar (e.g. `JsoniqLexer.KW_AS`). */
    protected abstract get kwAsTokenType(): number;

    /**
     * The symbolic name table for this grammar's lexer (e.g. `JsoniqLexer.symbolicNames`).
     * Used by {@link isNCNameOrKeyword}.
     */
    protected abstract get lexerSymbolicNames(): ReadonlyArray<string | null>;

    /**
     * Returns true when `token` can serve as the namespace prefix part of a QName.
     * In both JSONiq and XQuery the grammar's `ncName` rule accepts any keyword in
     * addition to bare NCName tokens, so `array`, `map`, `for`, etc. are all valid
     * prefixes.
     */
    protected isNCNameOrKeyword(token: Token | undefined): boolean {
        if (token === undefined) {
            return false;
        }
        if (token.type === this.ncNameTokenType) {
            return true;
        }
        const symbolicName = this.lexerSymbolicNames[token.type];
        return (
            symbolicName !== null && symbolicName !== undefined && symbolicName.startsWith("KW_")
        );
    }
}

export function getCompletionTokenContext<T extends TokenContextAnalyzer>(
    tokens: Token[],
    cursorOffset: number,
    tokenContextAnalyzer: new (tokens: Token[], cursorOffset: number) => T,
): CompletionTokenContext {
    const cursor = new tokenContextAnalyzer(tokens, cursorOffset);

    if (cursor.isAfterDeclareFunction()) {
        return FUNCTION_NAME_CONTEXT;
    }

    if (cursor.isAtTypeName()) {
        return { ...TYPE_NAME_CONTEXT, qnamePrefix: cursor.isAfterQNamePrefix() };
    }

    if (cursor.isAtVariableDeclarationName()) {
        return VARIABLE_DECLARATION_CONTEXT;
    }

    if (cursor.isAtTopLevelProlog()) {
        return { ...TOP_LEVEL_PROLOG_CONTEXT, qnamePrefix: cursor.isAfterQNamePrefix() };
    }

    return { ...DEFAULT_CONTEXT, qnamePrefix: cursor.isAfterQNamePrefix() };
}

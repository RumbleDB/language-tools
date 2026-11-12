import { Token } from "antlr4ng";

import { CompletionTokenContext } from "./types/completion.js";

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

    protected get previous(): Token | undefined {
        return this.tokensBeforeCursor.at(-1);
    }

    protected get beforePrevious(): Token | undefined {
        return this.tokensBeforeCursor.at(-2);
    }

    /** Token type for a bare NCName in this grammar (e.g. `JsoniqLexer.NCName`). */
    protected abstract get ncNameTokenType(): number;

    /** Token type for `:` in this grammar (e.g. `JsoniqLexer.COLON`). */
    protected abstract get colonTokenType(): number;

    /** Token type for `$` in this grammar (e.g. `JsoniqLexer.DOLLAR`). */
    protected abstract get dollarTokenType(): number;

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

    return { qnamePrefix: cursor.isAfterQNamePrefix() };
}

import { Token } from "antlr4ng";

import { XQueryLexer } from "./grammar/XQueryLexer.js";

export type CompletionTokenContextKind =
    | "default"
    | "function-name"
    | "top-level-prolog"
    | "variable-declaration";

export interface CompletionTokenContext {
    kind: CompletionTokenContextKind;
    allowKeywords: boolean;
    allowPrologKeywords: boolean;
    allowReferences: boolean;
    allowVariableDeclarations: boolean;
}

const DEFAULT_CONTEXT: CompletionTokenContext = {
    kind: "default",
    allowKeywords: true,
    allowPrologKeywords: false,
    allowReferences: true,
    allowVariableDeclarations: false,
};

const FUNCTION_NAME_CONTEXT: CompletionTokenContext = {
    kind: "function-name",
    allowKeywords: false,
    allowPrologKeywords: false,
    allowReferences: false,
    allowVariableDeclarations: false,
};

const TOP_LEVEL_PROLOG_CONTEXT: CompletionTokenContext = {
    kind: "top-level-prolog",
    allowKeywords: true,
    allowPrologKeywords: true,
    allowReferences: true,
    allowVariableDeclarations: false,
};

const VARIABLE_DECLARATION_CONTEXT: CompletionTokenContext = {
    kind: "variable-declaration",
    allowKeywords: false,
    allowPrologKeywords: false,
    allowReferences: false,
    allowVariableDeclarations: true,
};

const VARIABLE_DECLARATION_STARTERS = new Set([
    XQueryLexer.KW_VARIABLE,
    XQueryLexer.KW_LET,
    XQueryLexer.KW_FOR,
    XQueryLexer.KW_EVERY,
    XQueryLexer.KW_SOME,
    XQueryLexer.KW_COUNT,
]);

export function getCompletionTokenContext(
    tokens: Token[],
    cursorOffset: number,
): CompletionTokenContext {
    const cursor = new DefaultTokenCursor(tokens, cursorOffset);

    if (cursor.isAfterDeclareFunction()) {
        return FUNCTION_NAME_CONTEXT;
    }

    if (cursor.isAtVariableDeclarationName()) {
        return VARIABLE_DECLARATION_CONTEXT;
    }

    if (cursor.isAtTopLevelProlog()) {
        return TOP_LEVEL_PROLOG_CONTEXT;
    }

    return DEFAULT_CONTEXT;
}

class DefaultTokenCursor {
    private readonly tokensBeforeCursor: Token[];

    public constructor(tokens: Token[], cursorOffset: number) {
        this.tokensBeforeCursor = tokens.filter(
            (token) =>
                token.type !== Token.EOF &&
                (token.channel ?? Token.DEFAULT_CHANNEL) === Token.DEFAULT_CHANNEL &&
                token.start < cursorOffset,
        );
    }

    public isAfterDeclareFunction(): boolean {
        return (
            this.previous?.type === XQueryLexer.KW_FUNCTION &&
            this.beforePreviousIs(XQueryLexer.KW_DECLARE)
        );
    }

    public isAtVariableDeclarationName(): boolean {
        if (this.previous === undefined) {
            return false;
        }

        if (isVariableDeclarationStarter(this.previous)) {
            return true;
        }

        return (
            this.previous.type === XQueryLexer.DOLLAR &&
            this.beforePrevious !== undefined &&
            (isVariableDeclarationStarter(this.beforePrevious) ||
                this.isAfterFunctionParameterSeparator())
        );
    }

    public isAtTopLevelProlog(): boolean {
        if (this.tokensBeforeCursor.length === 0) {
            return true;
        }

        return this.braceDepth === 0 && this.previous?.type === XQueryLexer.SEMICOLON;
    }

    private get previous(): Token | undefined {
        return this.tokensBeforeCursor.at(-1);
    }

    private get beforePrevious(): Token | undefined {
        return this.tokensBeforeCursor.at(-2);
    }

    private beforePreviousIs(tokenType: number): boolean {
        return this.beforePrevious?.type === tokenType;
    }

    private isAfterFunctionParameterSeparator(): boolean {
        if (
            this.beforePrevious?.type !== XQueryLexer.LPAREN &&
            this.beforePrevious?.type !== XQueryLexer.COMMA
        ) {
            return false;
        }

        return (
            this.lastIndexOf(XQueryLexer.KW_FUNCTION) >
            Math.max(this.lastIndexOf(XQueryLexer.LBRACE), this.lastIndexOf(XQueryLexer.RPAREN))
        );
    }

    private get braceDepth(): number {
        let depth = 0;
        for (const token of this.tokensBeforeCursor) {
            if (token.type === XQueryLexer.LBRACE) {
                depth += 1;
            } else if (token.type === XQueryLexer.RBRACE) {
                depth = Math.max(depth - 1, 0);
            }
        }

        return depth;
    }

    private lastIndexOf(tokenType: number): number {
        for (let index = this.tokensBeforeCursor.length - 1; index >= 0; index -= 1) {
            if (this.tokensBeforeCursor[index]?.type === tokenType) {
                return index;
            }
        }

        return -1;
    }
}

function isVariableDeclarationStarter(token: Token): boolean {
    return VARIABLE_DECLARATION_STARTERS.has(token.type);
}

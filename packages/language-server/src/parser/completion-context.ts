import { Token } from "antlr4ng";

import { CompletionTokenContext } from "./types/completion.js";

const DEFAULT_CONTEXT: CompletionTokenContext = {
    kind: "default",
    allowKeywords: true,
    allowPrologKeywords: false,
    allowReferences: true,
    allowTypeReferences: false,
    allowVariableDeclarations: false,
};

const FUNCTION_NAME_CONTEXT: CompletionTokenContext = {
    kind: "function-name",
    allowKeywords: false,
    allowPrologKeywords: false,
    allowReferences: false,
    allowTypeReferences: false,
    allowVariableDeclarations: false,
};

const TYPE_NAME_CONTEXT: CompletionTokenContext = {
    kind: "type-name",
    allowKeywords: false,
    allowPrologKeywords: false,
    allowReferences: false,
    allowTypeReferences: true,
    allowVariableDeclarations: false,
};

const TOP_LEVEL_PROLOG_CONTEXT: CompletionTokenContext = {
    kind: "top-level-prolog",
    allowKeywords: true,
    allowPrologKeywords: true,
    allowReferences: true,
    allowTypeReferences: false,
    allowVariableDeclarations: false,
};

const VARIABLE_DECLARATION_CONTEXT: CompletionTokenContext = {
    kind: "variable-declaration",
    allowKeywords: false,
    allowPrologKeywords: false,
    allowReferences: false,
    allowTypeReferences: false,
    allowVariableDeclarations: true,
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
    public abstract isAtTypeName(): boolean;
    public abstract isAtVariableDeclarationName(): boolean;
    public abstract isAtTopLevelProlog(): boolean;

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
        return TYPE_NAME_CONTEXT;
    }

    if (cursor.isAtVariableDeclarationName()) {
        return VARIABLE_DECLARATION_CONTEXT;
    }

    if (cursor.isAtTopLevelProlog()) {
        return TOP_LEVEL_PROLOG_CONTEXT;
    }

    return DEFAULT_CONTEXT;
}

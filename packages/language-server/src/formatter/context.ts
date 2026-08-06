import { CommonTokenStream, Token } from "antlr4ng";

import type { FormatterOptions } from "./options.js";

/**
 * Tracks formatting state during a formatting pass.
 * Manages indentation, output buffering, and HIDDEN channel access.
 */
export class FormatterContext {
    private indentLevel: number = 0;
    public readonly options: FormatterOptions;
    public readonly tokenStream: CommonTokenStream;

    public constructor(options: FormatterOptions, tokenStream: CommonTokenStream) {
        this.options = options;
        this.tokenStream = tokenStream;
    }

    public get currentIndent(): string {
        const char = this.options.useTabs ? "\t" : " ";
        const count = this.options.useTabs
            ? this.indentLevel
            : this.indentLevel * this.options.indentSize;
        return char.repeat(count);
    }

    public indent(): void {
        this.indentLevel += 1;
    }

    public dedent(): void {
        this.indentLevel = Math.max(0, this.indentLevel - 1);
    }

    /**
     * Returns the HIDDEN-channel tokens (comments, but not whitespace)
     * that fall between two token indices.
     */
    public getCommentsBetween(fromTokenIndex: number, toTokenIndex: number): Token[] {
        const comments: Token[] = [];

        for (let i = fromTokenIndex + 1; i < toTokenIndex; i++) {
            const token = this.tokenStream.get(i);
            if (token.channel !== Token.DEFAULT_CHANNEL && !isWhitespace(token)) {
                comments.push(token);
            }
        }

        return comments;
    }

    /**
     * Returns HIDDEN-channel comment tokens that appear before the given token index.
     * Stops at the first DEFAULT_CHANNEL token or the beginning of the stream.
     */
    public getCommentsBefore(tokenIndex: number): Token[] {
        const comments: Token[] = [];

        for (let i = tokenIndex - 1; i >= 0; i--) {
            const token = this.tokenStream.get(i);
            if (token.channel === Token.DEFAULT_CHANNEL) {
                break;
            }
            if (!isWhitespace(token)) {
                comments.unshift(token);
            }
        }

        return comments;
    }

    /**
     * Returns HIDDEN-channel comment tokens that appear after the given token index.
     * Stops at the first DEFAULT_CHANNEL token or the end of the stream.
     */
    public getCommentsAfter(tokenIndex: number): Token[] {
        const comments: Token[] = [];
        const size = this.tokenStream.size;

        for (let i = tokenIndex + 1; i < size; i++) {
            const token = this.tokenStream.get(i);
            if (token.channel === Token.DEFAULT_CHANNEL) {
                break;
            }
            if (!isWhitespace(token)) {
                comments.push(token);
            }
        }

        return comments;
    }

    /**
     * Checks whether there is a newline in the original source between two token indices.
     * Used to preserve intentional blank lines.
     */
    public hasNewlineBetween(fromTokenIndex: number, toTokenIndex: number): boolean {
        for (let i = fromTokenIndex + 1; i < toTokenIndex; i++) {
            const token = this.tokenStream.get(i);
            if (
                isWhitespace(token) &&
                token.text !== null &&
                token.text !== undefined &&
                token.text.includes("\n")
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Counts the number of newlines in the original source between two token indices.
     */
    public countNewlinesBetween(fromTokenIndex: number, toTokenIndex: number): number {
        let count = 0;
        for (let i = fromTokenIndex + 1; i < toTokenIndex; i++) {
            const token = this.tokenStream.get(i);
            if (isWhitespace(token) && token.text !== null && token.text !== undefined) {
                for (const ch of token.text) {
                    if (ch === "\n") {
                        count += 1;
                    }
                }
            }
        }
        return count;
    }
}

function isWhitespace(token: Token): boolean {
    return token.text !== null && token.text !== undefined && /^[\s]+$/.test(token.text);
}

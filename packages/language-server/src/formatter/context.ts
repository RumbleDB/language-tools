import { CommonTokenStream, Token } from "antlr4ng";

import { buildCommentAttachmentMap, CommentAttachmentMap } from "./comments.js";
import type { FormatterOptions } from "./options.js";

export interface FormatterContextState {
    indentLevel: number;
    emittedComments: Set<number>;
}

/**
 * Tracks formatting state during a formatting pass.
 * Manages indentation, line width, and token comment attachments.
 */
export class FormatterContext {
    private indentLevel: number = 0;
    public readonly options: FormatterOptions;
    public readonly tokenStream: CommonTokenStream;
    public readonly attachmentMap: CommentAttachmentMap;

    private emittedComments: Set<number> = new Set();

    public constructor(options: FormatterOptions, tokenStream: CommonTokenStream) {
        this.options = options;
        this.tokenStream = tokenStream;
        this.attachmentMap = buildCommentAttachmentMap(tokenStream);
    }

    public saveState(): FormatterContextState {
        return {
            indentLevel: this.indentLevel,
            emittedComments: new Set(this.emittedComments),
        };
    }

    public restoreState(state: FormatterContextState): void {
        this.indentLevel = state.indentLevel;
        this.emittedComments = new Set(state.emittedComments);
    }

    /**
     * Formats a terminal token at tokenIndex by emitting its attached leading comments,
     * its text content, and its attached trailing comments.
     */
    public formatToken(tokenIndex: number, text: string): string {
        let leadingText = "";

        // 1. Leading comments (on lines before this token)
        const leading = this.attachmentMap.leading.get(tokenIndex);
        if (leading) {
            for (const c of leading) {
                if (!this.emittedComments.has(c.tokenIndex)) {
                    this.emittedComments.add(c.tokenIndex);
                    const commentIndent =
                        c.tokenIndex === 0 || this.isStartOfDocumentComment(c)
                            ? ""
                            : this.currentIndent;
                    leadingText += `${commentIndent}${c.text?.trim()}\n`;
                }
            }
        }

        // 2. Token text
        let result = leadingText ? `${leadingText}${this.currentIndent}${text}` : text;

        // 3. Trailing comments (on the same line after this token)
        const trailing = this.attachmentMap.trailing.get(tokenIndex);
        if (trailing) {
            for (const c of trailing) {
                if (!this.emittedComments.has(c.tokenIndex)) {
                    this.emittedComments.add(c.tokenIndex);
                    result += ` ${c.text?.trim()}`;
                }
            }
        }

        return result;
    }

    /**
     * Formats any un-emitted dangling comments at the end of file.
     */
    public formatDanglingComments(): string {
        let result = "";
        for (const c of this.attachmentMap.dangling) {
            if (!this.emittedComments.has(c.tokenIndex)) {
                this.emittedComments.add(c.tokenIndex);
                result += `${c.text?.trim()}\n`;
            }
        }
        return result;
    }

    /**
     * Returns comment tokens strictly between two parser-token indices.
     *
     * This is retained for the generic formatter helpers. The normal visitor
     * path uses the precomputed attachment map, which also prevents duplicate
     * emission when a token is visited more than once during layout decisions.
     */
    public getCommentsBetween(fromTokenIndex: number, toTokenIndex: number): Token[] {
        const comments: Token[] = [];
        const start = Math.max(0, fromTokenIndex + 1);
        const end = Math.min(this.tokenStream.size, toTokenIndex);

        for (let i = start; i < end; i++) {
            const token = this.tokenStream.get(i);
            if (token.channel === Token.HIDDEN_CHANNEL && token.text?.trim().startsWith("(:")) {
                comments.push(token);
            }
        }

        return comments;
    }

    private isStartOfDocumentComment(comment: Token): boolean {
        for (let i = 0; i < comment.tokenIndex; i++) {
            const t = this.tokenStream.get(i);
            if (t.channel === Token.DEFAULT_CHANNEL && t.type !== -1) {
                return false;
            }
        }
        return true;
    }

    public indent(): void {
        this.indentLevel++;
    }

    public dedent(): void {
        this.indentLevel = Math.max(0, this.indentLevel - 1);
    }

    public get currentIndent(): string {
        return " ".repeat(this.indentLevel * this.options.indentSize);
    }

    public resetIndent(): void {
        this.indentLevel = 0;
    }
}

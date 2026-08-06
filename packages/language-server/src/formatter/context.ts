import { CommonTokenStream } from "antlr4ng";
import { Token } from "antlr4ng";

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

    /**
     * Saves the current formatting state (indentation + emitted-comment tracking).
     * Used before dry-run layout attempts so the state can be restored if the dry
     * run is discarded (e.g., when deciding single-line vs. multi-line layout).
     */
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
     * Formats a terminal token at tokenIndex by emitting:
     *  1. Any leading comments (on their own line before this token)
     *  2. The token text itself
     *  3. Any trailing comments (on the same line after this token)
     *
     * Leading comments are indented at the current indent level, except for
     * the very first comment in the document (top-of-file comments).
     */
    public formatToken(tokenIndex: number, text: string): string {
        const leading = this.flushLeadingComments(tokenIndex);
        let result = leading ? `${leading}${this.currentIndent}${text}` : text;
        result += this.flushTrailingComments(tokenIndex);
        return result;
    }

    /**
     * Emits any un-emitted leading comments for a token index and returns them
     * as a string. Does NOT emit the token itself.
     *
     * Use this when you need leading comments to appear before a construct that
     * you are building manually (i.e. not via visitTerminal).
     *
     * The returned string already ends with `\n` when non-empty, so the caller
     * can simply concatenate it before its own output.
     */
    public flushLeadingComments(tokenIndex: number): string {
        let result = "";
        const leading = this.attachmentMap.leading.get(tokenIndex);
        if (!leading) {
            return result;
        }
        for (const c of leading) {
            if (!this.emittedComments.has(c.tokenIndex)) {
                this.emittedComments.add(c.tokenIndex);
                const commentIndent = this.isFirstDocumentComment(c.tokenIndex)
                    ? ""
                    : this.currentIndent;
                result += `${commentIndent}${c.text?.trim()}\n`;
            }
        }
        return result;
    }

    /**
     * Emits any un-emitted trailing comments for a token index (inline comments
     * on the same line as the token). Returns them as a string starting with a
     * space, e.g. ` (: comment :)`.
     */
    public flushTrailingComments(tokenIndex: number): string {
        let result = "";
        const trailing = this.attachmentMap.trailing.get(tokenIndex);
        if (!trailing) {
            return result;
        }
        for (const c of trailing) {
            if (!this.emittedComments.has(c.tokenIndex)) {
                this.emittedComments.add(c.tokenIndex);
                result += ` ${c.text?.trim()}`;
            }
        }
        return result;
    }

    /**
     * Emits any dangling comments (those after the last token in the document).
     * Called once at the end of the top-level module visitor.
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

    /**
     * Returns true if the comment at `commentTokenIndex` is the first comment in
     * the document (i.e., no DEFAULT_CHANNEL token appears before it).
     * Such comments should not be indented.
     */
    private isFirstDocumentComment(commentTokenIndex: number): boolean {
        for (let i = 0; i < commentTokenIndex; i++) {
            const t = this.tokenStream.get(i);
            if (t.channel === Token.DEFAULT_CHANNEL && t.type !== Token.EOF) {
                return false;
            }
        }
        return true;
    }
}

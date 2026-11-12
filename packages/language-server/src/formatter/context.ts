import {
    CommonTokenStream,
    type ParseTree,
    ParserRuleContext,
    TerminalNode,
    Token,
} from "antlr4ng";

import { buildCommentAttachmentMap, CommentAttachmentMap } from "./comments.js";
import {
    blankLineStart,
    concat,
    Doc,
    hardline,
    lineStart,
    NIL,
    space,
    text,
    verbatim,
} from "./doc.js";
import type { FormatterOptions } from "./options.js";

/**
 * A source token and the comments attached directly around it.
 *
 * Keeping these parts separate lets a construct place leading comments outside
 * its layout group while retaining the token and trailing comments inside it.
 */
export interface TokenDoc {
    readonly leading: Doc;
    readonly value: Doc;
    readonly trailing: Doc;
}

export type XmlBoundarySpacePolicy = "preserve" | "strip";

/** Combines a structured source token for ordinary inline use. */
export function composeTokenDoc(token: TokenDoc): Doc {
    return concat([token.leading, token.value, token.trailing]);
}

/**
 * FormatterContext manages options, the token stream, and comment attachment maps
 * during Document IR construction.
 */
export class FormatterContext {
    public readonly options: FormatterOptions;

    private readonly tokenStream: CommonTokenStream;
    private readonly attachmentMap: CommentAttachmentMap;
    private readonly emittedComments = new Set<number>();
    private xmlBoundarySpacePolicy: XmlBoundarySpacePolicy = "strip";

    public constructor(options: FormatterOptions, tokenStream: CommonTokenStream) {
        this.options = options;
        this.tokenStream = tokenStream;
        this.attachmentMap = buildCommentAttachmentMap(tokenStream);
    }

    /**
     * Formats a real source token and keeps its attached comments separate.
     * Language adapters must use this method instead of constructing source
     * tokens with `text()`, otherwise attached comments can be misplaced.
     */
    public formatToken(target: TerminalNode | Token): TokenDoc {
        const tokenIndex = "symbol" in target ? target.symbol.tokenIndex : target.tokenIndex;
        const tokenText = "symbol" in target ? target.getText() : (target.text ?? "");
        return {
            leading: this.flushLeadingDoc(tokenIndex),
            value: text(tokenText),
            trailing: this.flushTrailingDoc(tokenIndex),
        };
    }

    /**
     * Formats a source range exactly as written, including hidden-channel text.
     * This is required for parser-level literals: ParserRuleContext.getText()
     * omits whitespace tokens that the parser did not consume.
     */
    public formatTokenRange(start: Token, stop: Token): TokenDoc {
        const tokenText = this.getSourceText(start, stop);
        return {
            leading: this.flushLeadingDoc(start.tokenIndex),
            value: verbatim(tokenText),
            trailing: this.flushTrailingDoc(stop.tokenIndex),
        };
    }

    /**
     * Returns source text exactly as written without attaching formatter comments.
     * Use for semantic text regions nested inside a larger formatted construct.
     */
    public formatVerbatimRange(start: Token, stop: Token): Doc {
        return verbatim(this.getSourceText(start, stop));
    }

    /**
     * Returns the exact source gap between two tokens without attaching comments.
     * This is used for semantic XML boundary whitespace, which must retain its
     * original spelling under `declare boundary-space preserve`.
     */
    public formatVerbatimBetween(left: Token, right: Token): Doc {
        if (left.stop >= right.start - 1) {
            return NIL;
        }
        const inputStream = left.inputStream ?? right.inputStream;
        return verbatim(inputStream?.getTextFromRange(left.stop + 1, right.start - 1) ?? "");
    }

    /** Returns the exact source text covered by two tokens. */
    public getSourceText(start: Token, stop: Token): string {
        return (
            start.inputStream?.getTextFromRange(start.start, stop.stop) ??
            this.tokenStream.getTextFromRange(start, stop)
        );
    }

    /**
     * Checks whether the source breaks the line between an opening bracket and the first item after it. A construct
     * written that way, such as an object with one field per line, is kept expanded.
     */
    public breaksLineAfter(
        opening: TerminalNode | null,
        first: ParseTree | null | undefined,
    ): boolean {
        const next =
            first instanceof TerminalNode
                ? first.symbol
                : first instanceof ParserRuleContext
                  ? first.start
                  : null;
        if (opening === null || next === null || next === undefined) {
            return false;
        }
        const gap = opening.symbol.inputStream?.getTextFromRange(
            opening.symbol.stop + 1,
            next.start - 1,
        );
        return gap?.includes("\n") ?? false;
    }

    /** Checks whether the source has a blank line between two tokens. */
    public hasBlankLineBetween(left: Token, right: Token): boolean {
        const gap = left.inputStream?.getTextFromRange(left.stop + 1, right.start - 1) ?? "";
        return /\n[ \t\r]*\n/.test(gap);
    }

    /** Checks whether the source has a blank line right after a token, before the next comment or token. */
    public hasBlankLineAfter(token: Token): boolean {
        for (let index = token.tokenIndex + 1; index < this.tokenStream.size; index++) {
            const next = this.tokenStream.get(index);
            if (next.type === Token.EOF || (next.text ?? "").trim() !== "") {
                return this.hasBlankLineBetween(token, next);
            }
        }
        return false;
    }

    /** The last token before an index that the parser reads, or null at the start of the document. */
    private previousDefaultToken(tokenIndex: number): Token | null {
        for (let index = tokenIndex - 1; index >= 0; index--) {
            const token = this.tokenStream.get(index);
            if (token.channel === Token.DEFAULT_CHANNEL) {
                return token;
            }
        }
        return null;
    }

    /** Checks whether the source has any text, such as whitespace or a comment, between two tokens. */
    public hasGapBetween(left: Token, right: Token): boolean {
        return left.stop < right.start - 1;
    }

    /** Checks whether the source gap between two tokens contains only whitespace. */
    public hasOnlyWhitespaceBetween(left: Token, right: Token): boolean {
        if (left.stop >= right.start - 1) {
            return true;
        }
        const gap = left.inputStream?.getTextFromRange(left.stop + 1, right.start - 1);
        return gap !== undefined && gap !== null && /^\s*$/.test(gap);
    }

    public setXmlBoundarySpacePolicy(policy: XmlBoundarySpacePolicy): void {
        this.xmlBoundarySpacePolicy = policy;
    }

    public canReflowXmlBoundaryWhitespace(): boolean {
        return this.xmlBoundarySpacePolicy === "strip";
    }

    /**
     * Creates a token document when a generated parser accessor does not expose
     * the corresponding terminal. Source terminals should always use formatToken.
     */
    public formatSyntheticToken(tokenText: string): TokenDoc {
        return { leading: NIL, value: text(tokenText), trailing: NIL };
    }

    /**
     * Emits any un-emitted leading comments for a token index as a Doc. Each comment was on its own line, so it stays
     * there, or the next format would attach it to the token before it as a trailing comment. A blank line before or
     * after a comment in the source is kept.
     */
    public flushLeadingDoc(tokenIndex: number): Doc {
        const comments = (this.attachmentMap.leading.get(tokenIndex) ?? []).filter(
            (comment) => !this.emittedComments.has(comment.tokenIndex),
        );
        if (comments.length === 0) {
            return NIL;
        }

        const docs: Doc[] = [];
        let previous = this.previousDefaultToken(comments[0]!.tokenIndex);
        for (const comment of comments) {
            this.emittedComments.add(comment.tokenIndex);
            const blankBefore = previous !== null && this.hasBlankLineBetween(previous, comment);
            docs.push(
                blankBefore ? blankLineStart : lineStart,
                verbatim(comment.text?.trim() ?? ""),
            );
            previous = comment;
        }
        const next = this.tokenStream.get(tokenIndex);
        docs.push(this.hasBlankLineBetween(previous!, next) ? blankLineStart : hardline);
        return concat(docs);
    }

    /**
     * Emits any un-emitted trailing comments for a token index as a Doc.
     */
    public flushTrailingDoc(tokenIndex: number): Doc {
        const trailing = this.attachmentMap.trailing.get(tokenIndex);
        if (!trailing || trailing.length === 0) {
            return NIL;
        }

        const docs: Doc[] = [];
        for (const c of trailing) {
            if (!this.emittedComments.has(c.tokenIndex)) {
                this.emittedComments.add(c.tokenIndex);
                docs.push(space);
                docs.push(verbatim(c.text?.trim() ?? ""));
            }
        }
        return concat(docs);
    }

    /** Whether every comment of the document has been emitted. */
    public hasEmittedAllComments(): boolean {
        const { leading, trailing, dangling } = this.attachmentMap;
        const all = [...leading.values(), ...trailing.values(), dangling].flat();
        return all.every((comment) => this.emittedComments.has(comment.tokenIndex));
    }

    /**
     * Emits any dangling comments (after the last default token) as a Doc.
     */
    public formatDanglingDoc(): Doc {
        const docs: Doc[] = [];
        for (const c of this.attachmentMap.dangling) {
            if (!this.emittedComments.has(c.tokenIndex)) {
                this.emittedComments.add(c.tokenIndex);
                docs.push(hardline);
                docs.push(verbatim(c.text?.trim() ?? ""));
            }
        }
        return concat(docs);
    }
}

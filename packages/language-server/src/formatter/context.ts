import { CommonTokenStream, TerminalNode, Token } from "antlr4ng";

import { buildCommentAttachmentMap, CommentAttachmentMap } from "./comments.js";
import { concat, Doc, hardline, NIL, space, text } from "./doc.js";
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
        const tokenText =
            start.inputStream?.getTextFromRange(start.start, stop.stop) ??
            this.tokenStream.getTextFromRange(start, stop);
        return {
            leading: this.flushLeadingDoc(start.tokenIndex),
            value: text(tokenText),
            trailing: this.flushTrailingDoc(stop.tokenIndex),
        };
    }

    /**
     * Returns source text exactly as written without attaching formatter comments.
     * Use for semantic text regions nested inside a larger formatted construct.
     */
    public formatVerbatimRange(start: Token, stop: Token): Doc {
        const sourceText =
            start.inputStream?.getTextFromRange(start.start, stop.stop) ??
            this.tokenStream.getTextFromRange(start, stop);
        return text(sourceText);
    }

    /**
     * Creates a token document when a generated parser accessor does not expose
     * the corresponding terminal. Source terminals should always use formatToken.
     */
    public formatSyntheticToken(tokenText: string): TokenDoc {
        return { leading: NIL, value: text(tokenText), trailing: NIL };
    }

    /**
     * Emits any un-emitted leading comments for a token index as a Doc.
     */
    public flushLeadingDoc(tokenIndex: number): Doc {
        const leading = this.attachmentMap.leading.get(tokenIndex);
        if (!leading || leading.length === 0) {
            return NIL;
        }

        const docs: Doc[] = [];
        for (const c of leading) {
            if (!this.emittedComments.has(c.tokenIndex)) {
                this.emittedComments.add(c.tokenIndex);
                docs.push(text(c.text?.trim() ?? ""));
                docs.push(hardline);
            }
        }
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
                docs.push(text(c.text?.trim() ?? ""));
            }
        }
        return concat(docs);
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
                docs.push(text(c.text?.trim() ?? ""));
            }
        }
        return concat(docs);
    }
}

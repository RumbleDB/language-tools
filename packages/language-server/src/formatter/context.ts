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
    public readonly tokenStream: CommonTokenStream;
    public readonly attachmentMap: CommentAttachmentMap;

    private emittedComments: Set<number> = new Set();

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
    public formatToken(target: TerminalNode | Token | number, textFallback?: string): TokenDoc {
        let tokenIndex: number;
        let tokenText: string;

        if (typeof target === "number") {
            tokenIndex = target;
            tokenText = textFallback ?? "";
        } else if ("symbol" in target) {
            tokenIndex = target.symbol.tokenIndex;
            tokenText = target.getText();
        } else {
            tokenIndex = target.tokenIndex;
            tokenText = target.text ?? textFallback ?? "";
        }

        const leading = this.flushLeadingDoc(tokenIndex);
        return {
            leading,
            value: text(tokenText),
            trailing: this.flushTrailingDoc(tokenIndex),
        };
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

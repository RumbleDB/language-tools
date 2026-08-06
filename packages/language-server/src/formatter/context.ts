import { CommonTokenStream } from "antlr4ng";

import { buildCommentAttachmentMap, CommentAttachmentMap } from "./comments.js";
import { concat, Doc, hardline, NIL, text } from "./doc.js";
import type { FormatterOptions } from "./options.js";

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
     * Formats a terminal token at tokenIndex into a Doc node by attaching:
     *  1. Any leading comments (on their own line before this token)
     *  2. The token text itself as a TextDoc
     *  3. Any trailing comments (on the same line after this token)
     */
    public formatTokenDoc(tokenIndex: number, tokenText: string): Doc {
        const leading = this.flushLeadingDoc(tokenIndex);
        const tokenDoc = text(tokenText);
        const trailing = this.flushTrailingDoc(tokenIndex);

        return concat([leading, tokenDoc, trailing]);
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
                docs.push(text(" "));
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

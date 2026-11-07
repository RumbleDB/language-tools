import type { Token } from "antlr4ng";
import { defaultTokenAt, defaultTokenAfter, defaultTokenBefore } from "server/parser/utils.js";
import { CompletionItemKind, TextEdit, type CompletionItem } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { isPathSlash, nameEnd, referenceStart, replaceRange } from "./context.js";
import { escapeSnippetText } from "./providers/snippets.js";
import type { CompletionContext } from "./types.js";

export type EditContext = Pick<CompletionContext, "document" | "cursorOffset" | "getParseResult">;

/**
 * Creates the function that gives an item its final edit, which replaces the name being edited.
 *
 * A provider whose edit reaches past the cursor has decided what to replace. Otherwise a name is being edited when part
 * of it is before the cursor, as in `re|turn`, or when only one name fits there, as in `$a/|test`. At `|return`, an item
 * goes in front of the word.
 */
export function createItemEditor(context: EditContext): (item: CompletionItem) => TextEdit {
    const { document, cursorOffset } = context;
    const { tokens } = context.getParseResult();
    const start = referenceStart(tokens, cursorOffset);
    const isAfterSlash = isPathSlash(defaultTokenBefore(tokens, cursorOffset));
    // A step's `@` goes with the name after it.
    const tokenAfterSlash = isAfterSlash ? defaultTokenAt(tokens, cursorOffset) : undefined;
    const editedNameEnd = nameEnd(
        tokens,
        tokenAfterSlash?.text === "@" ? tokenAfterSlash.stop + 1 : cursorOffset,
    );

    const nextAfterName = nextTokenOnLine(document, tokens, editedNameEnd)?.text;
    // A function replacing a name before its arguments or arity only inserts its name: `fn:abs` at `fn:|concat(1)` gives
    // `fn:abs(1)`, and `fn:concat` at `con|cat#2` gives `fn:concat#2`. A parenthesis on another line is taken to start a
    // new expression.
    const isBeforeCall = nextAfterName === "(" || nextAfterName === "#";

    return (item) => {
        const edit = TextEdit.is(item.textEdit)
            ? item.textEdit
            : replaceRange(document, start, cursorOffset, item.insertText ?? item.label);
        const providerEnd = document.offsetAt(edit.range.end);
        const reachesPastCursor = providerEnd > cursorOffset;
        const isEditingName =
            reachesPastCursor || isAfterSlash || document.offsetAt(edit.range.start) < cursorOffset;
        if (reachesPastCursor || !isEditingName) {
            return TextEdit.replace(edit.range, edit.newText);
        }
        const writtenWords = textOfWrittenWords(item, document, tokens, editedNameEnd);
        const end = document.positionAt(editedNameEnd + writtenWords.length);
        if (writtenWords !== "") {
            const firstWord = item.label.slice(0, item.label.indexOf(" "));
            return TextEdit.replace({ start: edit.range.start, end }, firstWord + writtenWords);
        }
        return TextEdit.replace(
            { start: edit.range.start, end },
            item.kind === CompletionItemKind.Function && isBeforeCall
                ? escapeSnippetText(item.label)
                : edit.newText,
        );
    };
}

/**
 * The text after the first word of a keyword or operator, up to the end of its other words, when they are all already
 * written, as ` by` in `or|der by`. Keeping this text also keeps a comment between the words. An edit cannot span several
 * lines, so they must be on the line of the first word.
 */
function textOfWrittenWords(
    item: CompletionItem,
    document: TextDocument,
    tokens: Token[],
    editedNameEnd: number,
): string {
    if (item.kind !== CompletionItemKind.Keyword && item.kind !== CompletionItemKind.Operator) {
        return "";
    }
    let end = editedNameEnd;
    for (const word of item.label.split(" ").slice(1)) {
        const next = nextTokenOnLine(document, tokens, end);
        if (next?.text !== word) {
            return "";
        }
        end = next.stop + 1;
    }
    return document.getText({
        start: document.positionAt(editedNameEnd),
        end: document.positionAt(end),
    });
}

/** The next token, when it is on the line of the offset. Token lines count from one and document lines from zero. */
function nextTokenOnLine(document: TextDocument, tokens: Token[], offset: number) {
    const next = defaultTokenAfter(tokens, offset);
    return next?.line === document.positionAt(offset).line + 1 ? next : undefined;
}

import type { Token } from "antlr4ng";
import { defaultTokenAt, defaultTokenAfter, defaultTokenBefore } from "server/parser/utils.js";
import { CompletionItemKind, TextEdit, type CompletionItem } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { nameEnd, referenceStart, replaceRange } from "./context.js";
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
    const previousText = defaultTokenBefore(tokens, cursorOffset)?.text;
    const isAfterSlash = previousText === "/" || previousText === "//";
    // A step's `@` goes with the name after it.
    const tokenAfterSlash = isAfterSlash ? defaultTokenAt(tokens, cursorOffset) : undefined;
    const editedNameEnd = nameEnd(
        tokens,
        tokenAfterSlash?.text === "@" ? tokenAfterSlash.stop + 1 : cursorOffset,
    );

    const nextAfterName = nextTokenOnLine(document, tokens, editedNameEnd)?.text;
    // A function replacing a name before its arguments or arity only inserts its name.
    const isBeforeCall = nextAfterName === "(" || nextAfterName === "#";

    return (item) => {
        const edit = TextEdit.is(item.textEdit)
            ? item.textEdit
            : replaceRange(document, start, cursorOffset, item.insertText ?? item.label);
        const providerEnd = document.offsetAt(edit.range.end);
        const reachesPastCursor = providerEnd > cursorOffset;
        const isEditingName =
            reachesPastCursor || isAfterSlash || document.offsetAt(edit.range.start) < cursorOffset;
        const end =
            reachesPastCursor || !isEditingName
                ? providerEnd
                : endOfWrittenWords(item, document, tokens, editedNameEnd);

        return TextEdit.replace(
            { start: edit.range.start, end: document.positionAt(end) },
            isEditingName && item.kind === CompletionItemKind.Function && isBeforeCall
                ? escapeSnippetText(item.label)
                : edit.newText,
        );
    };
}

/**
 * The end of the words of a keyword that are already written after its first one, as `by` in `or|der by`. An edit cannot
 * span several lines, so they must be on the line of the first word.
 */
function endOfWrittenWords(
    item: CompletionItem,
    document: TextDocument,
    tokens: Token[],
    editedNameEnd: number,
): number {
    if (item.kind !== CompletionItemKind.Keyword) {
        return editedNameEnd;
    }
    let end = editedNameEnd;
    for (const word of item.label.split(" ").slice(1)) {
        const next = nextTokenOnLine(document, tokens, end);
        if (next?.text !== word) {
            return editedNameEnd;
        }
        end = next.stop + 1;
    }
    return end;
}

/** The next token, when it is on the line of the offset. Token lines count from one and document lines from zero. */
function nextTokenOnLine(document: TextDocument, tokens: Token[], offset: number) {
    const next = defaultTokenAfter(tokens, offset);
    return next?.line === document.positionAt(offset).line + 1 ? next : undefined;
}

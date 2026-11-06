import type { Token } from "antlr4ng";
import { nextDefaultTokenAt, previousDefaultToken } from "server/parser/utils.js";
import { CompletionItemKind, TextEdit, type CompletionItem } from "vscode-languageserver";

import { nameEnd, replaceTypedPrefix, typedPrefix } from "./context.js";
import { escapeSnippetText } from "./providers/snippets.js";
import type { CompletionContext } from "./types.js";

/** The part of a name before the cursor, for items that do not say what they replace. */
const NAME_PREFIX_PATTERN = /[A-Za-z_][\w.:-]*$/;

export type EditContext = Pick<
    CompletionContext,
    "document" | "source" | "cursorOffset" | "getParseResult"
>;

/**
 * Creates the function that gives an item its final edit, which replaces the name being edited.
 *
 * A provider whose edit reaches past the cursor has decided what to replace. Otherwise a name is being edited when part
 * of it is before the cursor, as in `re|turn`, or when only one name fits there, as in `$a/|test`. At `|return`, an item
 * goes in front of the word.
 */
export function createItemEditor(context: EditContext): (item: CompletionItem) => TextEdit {
    const { document, source, cursorOffset } = context;
    const { tokens } = context.getParseResult();
    const prefix = typedPrefix(source, cursorOffset, NAME_PREFIX_PATTERN) ?? "";
    const previousText = previousDefaultToken(tokens, cursorOffset)?.text;
    const isAfterSlash = previousText === "/" || previousText === "//";
    const editedNameEnd = nameEnd(tokens, cursorOffset);

    return (item) => {
        const edit = TextEdit.is(item.textEdit)
            ? item.textEdit
            : replaceTypedPrefix(document, cursorOffset, prefix, item.insertText ?? item.label);
        const providerEnd = document.offsetAt(edit.range.end);
        const isEditingName =
            providerEnd > cursorOffset ||
            isAfterSlash ||
            document.offsetAt(edit.range.start) < cursorOffset;
        const end =
            providerEnd > cursorOffset
                ? providerEnd
                : isEditingName
                  ? endOfWrittenWords(
                        item,
                        tokens,
                        editedNameEnd,
                        document.positionAt(editedNameEnd).line,
                    )
                  : cursorOffset;

        return TextEdit.replace(
            { start: edit.range.start, end: document.positionAt(end) },
            isEditingName && isCalled(item, tokens, end, document.positionAt(end).line)
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
    tokens: Token[],
    nameEnd: number,
    line: number,
): number {
    if (item.kind !== CompletionItemKind.Keyword) {
        return nameEnd;
    }
    let end = nameEnd;
    for (const word of item.label.split(" ").slice(1)) {
        const next = nextDefaultTokenAt(tokens, end);
        if (next?.text !== word || next.line !== line + 1) {
            return nameEnd;
        }
        end = next.stop + 1;
    }
    return end;
}

/**
 * A function replacing a name before its arguments or arity only inserts its name: `fn:abs` at `fn:|concat(1)` gives
 * `fn:abs(1)`, and `fn:concat` at `con|cat#2` gives `fn:concat#2`. A parenthesis on another line starts a new expression.
 */
function isCalled(item: CompletionItem, tokens: Token[], end: number, endLine: number): boolean {
    if (item.kind !== CompletionItemKind.Function) {
        return false;
    }
    const next = nextDefaultTokenAt(tokens, end);
    return next?.line === endLine + 1 && (next.text === "(" || next.text === "#");
}

import { InsertReplaceEdit, TextEdit, type CompletionItem } from "vscode-languageserver";

import { replaceTypedPrefix, typedPrefix, typedSuffix } from "./context.js";
import type { CompletionContext } from "./types.js";

/** The part of a name before the cursor, for items that do not say what they replace. */
const NAME_PREFIX_PATTERN = /[A-Za-z_][\w.:-]*$/;

/** The part of a name after the cursor. It stops at `.`, which starts a lookup in `$a|.b`. */
const NAME_SUFFIX_PATTERN = /^[\w:-]*/;

/**
 * Lets the client insert an item up to the cursor, or replace the name being edited, as its settings say. A name is being
 * edited when part of it is before the cursor, so that `return` at `re|turn` gives `return`. At `|return`, an item goes in
 * front of the word instead. A provider whose edit reaches past the cursor has decided what to replace, where only one
 * name fits, as for `c` at `$a.|test`. Clients without insert and replace edits always replace.
 */
export function finalizeCompletionItems(
    items: CompletionItem[],
    {
        document,
        source,
        cursorOffset,
    }: Pick<CompletionContext, "document" | "source" | "cursorOffset">,
    insertReplaceSupport: boolean,
): CompletionItem[] {
    const prefix = typedPrefix(source, cursorOffset, NAME_PREFIX_PATTERN) ?? "";
    const suffix = typedSuffix(source, cursorOffset, NAME_SUFFIX_PATTERN);
    const cursor = document.positionAt(cursorOffset);
    const endOfName = document.positionAt(cursorOffset + suffix.length);

    const toEdit = ({ textEdit, insertText, label }: CompletionItem) => {
        if (textEdit !== undefined && !TextEdit.is(textEdit)) {
            return textEdit;
        }
        const { range, newText } =
            textEdit ?? replaceTypedPrefix(document, cursorOffset, prefix, insertText ?? label);
        const replaceEnd =
            document.offsetAt(range.end) > cursorOffset
                ? range.end
                : document.offsetAt(range.start) < cursorOffset
                  ? endOfName
                  : cursor;
        return insertReplaceSupport
            ? InsertReplaceEdit.create(
                  newText,
                  { start: range.start, end: cursor },
                  { start: range.start, end: replaceEnd },
              )
            : TextEdit.replace({ start: range.start, end: replaceEnd }, newText);
    };

    return [...items]
        .sort((left, right) =>
            (left.sortText ?? `1:${left.label}`).localeCompare(
                right.sortText ?? `1:${right.label}`,
            ),
        )
        .map((item, index) => ({
            ...item,
            sortText: `${index.toString().padStart(5, "0")}:${item.label}`,
            textEdit: toEdit(item),
        }));
}

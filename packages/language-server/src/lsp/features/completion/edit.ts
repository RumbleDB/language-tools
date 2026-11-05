import {
    InsertReplaceEdit,
    TextEdit,
    type CompletionItem,
    type Range,
} from "vscode-languageserver";

import { replaceTypedPrefix, typedPrefix, typedSuffix } from "./context.js";
import { escapeSnippetText } from "./providers/snippets.js";
import type { CompletionContext, ProvidedCompletionItem } from "./types.js";

/** The part of a name before the cursor, for items that do not say what they replace. */
const NAME_PREFIX_PATTERN = /[A-Za-z_][\w.:-]*$/;

/** The part of a name after the cursor. It stops at `.`, which starts a lookup in `$a|.b`. */
const NAME_SUFFIX_PATTERN = /^[\w:-]*/;

/** The arguments of a call or the `#` of a function reference, already written after what an item replaces. */
const FUNCTION_USE_PATTERN = /^(?:[ \t]*\(|#)/;

export type EditContext = Pick<CompletionContext, "document" | "source" | "cursorOffset">;

/**
 * Creates the function that gives an item its final edit. The client either inserts the item up to the cursor or replaces
 * the name being edited, as its settings say. Clients without insert and replace edits always replace.
 */
export function createItemEditor(
    context: EditContext,
    insertReplaceSupport: boolean,
): (item: ProvidedCompletionItem) => NonNullable<CompletionItem["textEdit"]> {
    const { document, source, cursorOffset } = context;
    const prefix = typedPrefix(source, cursorOffset, NAME_PREFIX_PATTERN) ?? "";
    const suffix = typedSuffix(source, cursorOffset, NAME_SUFFIX_PATTERN);
    const cursor = document.positionAt(cursorOffset);

    return (item) => {
        if (item.textEdit !== undefined && !TextEdit.is(item.textEdit)) {
            return item.textEdit;
        }
        const edit =
            item.textEdit ??
            replaceTypedPrefix(document, cursorOffset, prefix, item.insertText ?? item.label);
        const replaced = replacedRange(edit, context, suffix);
        const textAfter = source.slice(document.offsetAt(replaced.end));
        const newText = insertedText(item, edit.newText, textAfter);

        return insertReplaceSupport
            ? InsertReplaceEdit.create(newText, { start: replaced.start, end: cursor }, replaced)
            : TextEdit.replace(replaced, newText);
    };
}

/**
 * A provider whose edit reaches past the cursor has decided what to replace, as where only one name fits in `$a.|test`.
 * Otherwise a name is being edited only when part of it is before the cursor, as in `re|turn`. At `|return`, an item goes
 * in front of the word.
 */
function replacedRange({ range }: TextEdit, context: EditContext, suffix: string): Range {
    const { document, cursorOffset } = context;
    if (document.offsetAt(range.end) > cursorOffset) {
        return range;
    }
    const isEditingName = document.offsetAt(range.start) < cursorOffset;
    const end = cursorOffset + (isEditingName ? suffix.length : 0);
    return { start: range.start, end: document.positionAt(end) };
}

/**
 * A function before its arguments or arity only inserts its name: `fn:abs` at `fn:|concat(1)` gives `fn:abs(1)`, and
 * `fn:concat` at `con|cat#2` gives `fn:concat#2`.
 */
function insertedText(item: ProvidedCompletionItem, text: string, textAfter: string): string {
    return item.functionName !== undefined && FUNCTION_USE_PATTERN.test(textAfter)
        ? escapeSnippetText(item.functionName)
        : text;
}

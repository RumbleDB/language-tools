import {
    CompletionItemKind,
    TextEdit,
    type CompletionItem,
    type Range,
} from "vscode-languageserver";

import { replaceTypedPrefix, typedPrefix, typedSuffix } from "./context.js";
import { escapeSnippetText } from "./providers/snippets.js";
import type { CompletionContext } from "./types.js";

/** The part of a name before the cursor, for items that do not say what they replace. */
const NAME_PREFIX_PATTERN = /[A-Za-z_][\w.:-]*$/;

/** The part of a name after the cursor. It stops at `.`, which starts a lookup in `$a|.b`. */
const NAME_SUFFIX_PATTERN = /^[\w:-]*/;

/**
 * The arguments of a call or the `#` of a function reference, already written after what an item replaces. A `(:` starts
 * a comment instead.
 */
const FUNCTION_USE_PATTERN = /^[ \t]*(?:\((?!:)|#)/;

export type EditContext = Pick<CompletionContext, "document" | "source" | "cursorOffset">;

/** Creates the function that gives an item its final edit, which replaces the name being edited. */
export function createItemEditor(context: EditContext): (item: CompletionItem) => TextEdit {
    const { document, source, cursorOffset } = context;
    const prefix = typedPrefix(source, cursorOffset, NAME_PREFIX_PATTERN) ?? "";
    const suffix = typedSuffix(source, cursorOffset, NAME_SUFFIX_PATTERN);

    return (item) => {
        const edit = TextEdit.is(item.textEdit)
            ? item.textEdit
            : replaceTypedPrefix(document, cursorOffset, prefix, item.insertText ?? item.label);
        const replaced = replacedRange(edit, context, suffix);
        const textAfter = source.slice(document.offsetAt(replaced.end));
        return TextEdit.replace(replaced, insertedText(item, edit.newText, textAfter));
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
function insertedText(item: CompletionItem, text: string, textAfter: string): string {
    return item.kind === CompletionItemKind.Function && FUNCTION_USE_PATTERN.test(textAfter)
        ? escapeSnippetText(item.label)
        : text;
}

import { formatObjectField, type ObjectTypeDefinition } from "server/analysis/index.js";
import { getFocusAtPosition } from "server/integrations/rumble/operations/focus-at-position/service.js";
import { previousDefaultToken } from "server/parser/utils.js";
import { CompletionItemKind } from "vscode-languageserver";

import { nameEnd, nameStart, replaceTypedPrefix } from "../context.js";
import type { CompletionProvider } from "../types.js";

/** A quoted field name after the cursor. Only one name fits after a dot, so it is always the one replaced. */
const QUOTED_FIELD_NAME_PATTERN = /^"(?:[^"\\\n]|\\.)*"/;
const UNQUOTED_FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export const provideObjectFieldCompletions: CompletionProvider = async (context) => {
    const { intent, source, cursorOffset, document } = context;
    const { tokens } = context.getParseResult();
    const fieldStart = nameStart(tokens, cursorOffset);
    const dot = previousDefaultToken(tokens, fieldStart);
    if (!intent.allowObjectLookup || dot?.text !== ".") {
        return null;
    }

    const focus = await getFocusAtPosition(
        document,
        document.positionAt(dot.stop + 1),
        context.wrapper,
    );
    const objectType = focus.sequenceType?.itemType;

    if (objectType?.kind !== "object") {
        return [];
    }

    const fieldPrefix = source.slice(fieldStart, cursorOffset);
    const fieldSuffix =
        source.slice(cursorOffset).match(QUOTED_FIELD_NAME_PATTERN)?.[0] ??
        source.slice(cursorOffset, nameEnd(tokens, cursorOffset));
    return objectFieldCompletions(objectType, fieldPrefix).map(([fieldName, field]) => ({
        label: fieldName,
        kind: CompletionItemKind.Field,
        labelDetails: { detail: formatObjectField(field) },
        textEdit: replaceTypedPrefix(
            document,
            cursorOffset,
            fieldPrefix,
            UNQUOTED_FIELD_NAME_PATTERN.test(fieldName) ? fieldName : JSON.stringify(fieldName),
            fieldSuffix,
        ),
    }));
};

function objectFieldCompletions(
    objectType: ObjectTypeDefinition,
    fieldPrefix: string,
): Array<[string, ObjectTypeDefinition["fields"][string]]> {
    return Object.entries(objectType.fields).filter(([fieldName]) =>
        fieldName.startsWith(fieldPrefix),
    );
}

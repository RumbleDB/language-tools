import { formatObjectField, type ObjectTypeDefinition } from "server/analysis/index.js";
import { getFocusAtPosition } from "server/integrations/rumble/operations/focus-at-position/service.js";
import { CompletionItemKind } from "vscode-languageserver";

import { replaceTypedPrefix, typedPrefix, typedSuffix } from "../context.js";
import type { CompletionProvider, CompletionContext } from "../types.js";

const OBJECT_FIELD_PREFIX_PATTERN = /[A-Za-z_][A-Za-z0-9_:-]*$/;
/** The field name after the cursor, quoted or not. Only one name fits after a dot, so it is always the one replaced. */
const OBJECT_FIELD_SUFFIX_PATTERN = /^(?:"[^"\n]*"|[\w:-]*)/;
const UNQUOTED_FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

interface DotCompletionContext {
    dotOffset: number;
    fieldPrefix: string;
}

export const provideObjectFieldCompletions: CompletionProvider = async (context) => {
    const dotContext = getDotCompletionContext(context);
    if (
        dotContext === null ||
        !context.intent.allowObjectLookup ||
        context.intent.objectLookupDotOffset !== dotContext.dotOffset
    ) {
        return null;
    }

    const focus = await getFocusAtPosition(
        context.document,
        context.document.positionAt(dotContext.dotOffset + 1),
        context.wrapper,
    );
    const objectType = focus.sequenceType?.itemType;

    if (objectType?.kind !== "object") {
        return [];
    }

    return objectFieldCompletions(objectType, dotContext.fieldPrefix).map(([fieldName, field]) => ({
        label: fieldName,
        kind: CompletionItemKind.Field,
        labelDetails: { detail: formatObjectField(field) },
        textEdit: replaceTypedPrefix(
            context.document,
            context.cursorOffset,
            dotContext.fieldPrefix,
            UNQUOTED_FIELD_NAME_PATTERN.test(fieldName) ? fieldName : JSON.stringify(fieldName),
            typedSuffix(context.source, context.cursorOffset, OBJECT_FIELD_SUFFIX_PATTERN),
        ),
    }));
};

function getDotCompletionContext(context: CompletionContext): DotCompletionContext | null {
    const fieldPrefix =
        typedPrefix(context.source, context.cursorOffset, OBJECT_FIELD_PREFIX_PATTERN) ?? "";
    const dotOffset = context.cursorOffset - fieldPrefix.length - 1;

    if (dotOffset < 0 || context.source[dotOffset] !== ".") {
        return null;
    }

    return { dotOffset, fieldPrefix };
}

function objectFieldCompletions(
    objectType: ObjectTypeDefinition,
    fieldPrefix: string,
): Array<[string, ObjectTypeDefinition["fields"][string]]> {
    return Object.entries(objectType.fields).filter(([fieldName]) =>
        fieldName.startsWith(fieldPrefix),
    );
}

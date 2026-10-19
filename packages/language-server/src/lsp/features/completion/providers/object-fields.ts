import { formatObjectField, type ObjectTypeDefinition } from "server/analysis/index.js";
import { getTypeAtPositionFromSource } from "server/integrations/rumble/operations/type-at-position/service.js";
import { CompletionItemKind } from "vscode-languageserver";

import { replaceTypedPrefix, typedPrefix } from "../context.js";
import type { CompletionProvider, CompletionContext } from "../types.js";

const OBJECT_FIELD_PREFIX_PATTERN = /[A-Za-z_][A-Za-z0-9_:-]*$/;
const UNQUOTED_FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

interface DotCompletionContext {
    dotOffset: number;
    fieldPrefix: string;
    syntheticSource: string;
    /** Where the context item that stands for each object starts in the synthetic source. */
    contextItemOffset: number;
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

    const result = await getTypeAtPositionFromSource(
        context.document.uri,
        dotContext.syntheticSource,
        context.document.positionAt(dotContext.contextItemOffset),
        context.wrapper,
    );
    const objectType = result.sequenceType?.itemType;

    if (objectType?.kind !== "object") {
        return [];
    }

    return objectFieldCompletions(objectType, dotContext.fieldPrefix).map(([fieldName, field]) => ({
        label: fieldName,
        kind: CompletionItemKind.Field,
        labelDetails: { detail: formatObjectField(field) },
        textEdit: replaceTypedPrefix(
            context.document,
            dotContext.dotOffset + 1 + dotContext.fieldPrefix.length,
            dotContext.fieldPrefix,
            UNQUOTED_FIELD_NAME_PATTERN.test(fieldName) ? fieldName : JSON.stringify(fieldName),
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

    // The lookup is replaced with `!$$`, which binds the context item to each item before the dot. An enclosing
    // expression, such as an `if` or a FLWOR expression, may end where the dot was, but none ends at the context item.
    return {
        dotOffset,
        fieldPrefix,
        syntheticSource:
            context.source.slice(0, dotOffset) + "!$$" + context.source.slice(context.cursorOffset),
        contextItemOffset: dotOffset + 1,
    };
}

function objectFieldCompletions(
    objectType: ObjectTypeDefinition,
    fieldPrefix: string,
): Array<[string, ObjectTypeDefinition["fields"][string]]> {
    return Object.entries(objectType.fields).filter(([fieldName]) =>
        fieldName.startsWith(fieldPrefix),
    );
}

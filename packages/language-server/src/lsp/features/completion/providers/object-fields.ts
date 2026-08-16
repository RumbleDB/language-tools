import { formatTypeDefinition, type ObjectTypeDefinition } from "server/analysis/type-system.js";
import { getTypeAtPositionFromSource } from "server/integrations/rumble/operations/type-at-position/service.js";
import { CompletionItemKind } from "vscode-languageserver";

import { replaceTypedPrefix, typedPrefix } from "../context.js";
import type { CompletionProvider, CompletionContext } from "../types.js";

const OBJECT_FIELD_PREFIX_PATTERN = /[A-Za-z_][A-Za-z0-9_:-]*$/;

interface DotCompletionContext {
    dotOffset: number;
    fieldPrefix: string;
    syntheticSource: string;
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
        context.document.positionAt(dotContext.dotOffset),
    );
    const objectType = result.sequenceType?.itemType;

    if (objectType?.kind !== "object") {
        return [];
    }

    return objectFieldCompletions(objectType, dotContext.fieldPrefix).map(
        ([fieldName, fieldType]) => ({
            label: fieldName,
            kind: CompletionItemKind.Field,
            detail: formatTypeDefinition(fieldType),
            textEdit: replaceTypedPrefix(
                context.document,
                dotContext.dotOffset + 1 + dotContext.fieldPrefix.length,
                dotContext.fieldPrefix,
                fieldName,
            ),
        }),
    );
};

function getDotCompletionContext(context: CompletionContext): DotCompletionContext | null {
    const fieldPrefix =
        typedPrefix(context.source, context.cursorOffset, OBJECT_FIELD_PREFIX_PATTERN) ?? "";
    const dotOffset = context.cursorOffset - fieldPrefix.length - 1;

    if (dotOffset < 0 || context.source[dotOffset] !== ".") {
        return null;
    }

    return {
        dotOffset,
        fieldPrefix,
        syntheticSource:
            context.source.slice(0, dotOffset) + context.source.slice(context.cursorOffset),
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

import { formatSequenceType } from "server/analysis/index.js";
import type { PathStepScope } from "server/integrations/rumble/operations/type-at-position/protocol.js";
import { getTypeAtPositionFromSource } from "server/integrations/rumble/operations/type-at-position/service.js";
import { getActiveParserId } from "server/parser/utils.js";
import { CompletionItemKind, type CompletionItem } from "vscode-languageserver";

import { getQNameCompletionLabels, replaceTypedPrefix } from "../context.js";
import type { CompletionContext, CompletionProvider } from "../types.js";

/** The part of a step name typed so far, optionally after `@`. */
const STEP_NAME = String.raw`(@?)((?:[A-Za-z_][\w.-]*:)?[\w.-]*)$`;

/** A `/` or `//` before the step. */
const PATH_STEP_PATTERN = new RegExp(String.raw`(?<!\/)(\/\/?)` + STEP_NAME);

/** A step without a path before it, which starts from the context item, e.g. in `[o:pr`. */
const CONTEXT_ITEM_STEP_PATTERN = new RegExp(String.raw`(?<![\w.$\/@:#"'-])` + STEP_NAME);

interface StepCompletionRequest {
    /** The source with the incomplete step replaced, so that it compiles. */
    syntheticSource: string;
    /** Where the expression whose type the step applies to ends, or starts for the context item. */
    typeOffset: number;
    scope: PathStepScope;
    attributeAxis: boolean;
    namePrefix: string;
}

/** Suggests the children or attributes that the schema declares after `/` or `//` in a schema-typed path. */
export const providePathStepCompletions: CompletionProvider = async (context) => {
    const match = typedBeforeCursor(context, PATH_STEP_PATTERN);
    // An expression must be able to start right after the slash, which excludes strings and comments.
    if (match === null || !allowsExpressionAt(context, match.index + 1)) {
        return null;
    }
    const [, slashes, attributeMarker, namePrefix = ""] = match.groups;
    return completeSteps(context, {
        // Ask for the type of the path before the step, so the incomplete step does not prevent compilation.
        syntheticSource:
            context.source.slice(0, match.index) + context.source.slice(context.cursorOffset),
        typeOffset: match.index,
        // E//S applies S to E and to each of its descendants.
        scope: slashes === "//" ? "descendants" : "children",
        attributeAxis: attributeMarker === "@",
        namePrefix,
    });
};

/**
 * Suggests the children or attributes that the schema declares for a schema-typed context item, as for the first step
 * in a predicate. Function and variable names remain valid there, so these suggestions are added to the others.
 */
export const provideContextItemStepCompletions: CompletionProvider = async (context) => {
    const match = typedBeforeCursor(context, CONTEXT_ITEM_STEP_PATTERN);
    if (
        match === null ||
        !setsContextItem(context.source, match.index) ||
        !allowsExpressionAt(context, match.index)
    ) {
        return null;
    }
    // Only schema-typed nodes have declared steps, so avoid asking for the type in other modules.
    if (context.getModuleProlog().schemaImports.length === 0) {
        return null;
    }
    const [, attributeMarker, namePrefix = ""] = match.groups;
    const contextItem = getActiveParserId(context.document) === "xquery" ? "." : "$$";
    return completeSteps(context, {
        syntheticSource:
            context.source.slice(0, match.index) +
            contextItem +
            context.source.slice(context.cursorOffset),
        // At the context item's start, its own type is the narrowest one.
        typeOffset: match.index,
        scope: "children",
        attributeAxis: attributeMarker === "@",
        namePrefix,
    });
};

async function completeSteps(
    context: CompletionContext,
    request: StepCompletionRequest,
): Promise<CompletionItem[] | null> {
    const result = await getTypeAtPositionFromSource(
        context.document.uri,
        request.syntheticSource,
        context.document.positionAt(request.typeOffset),
        context.wrapper,
        request.scope,
    );
    const steps = request.attributeAxis ? result.attributes : result.children;
    if (steps === undefined) {
        return null;
    }

    const { namespaces, defaultElementTypeNamespace } = await context.getAnalysis();
    // Unprefixed attribute names are in no namespace, whatever the default element namespace is.
    const defaultNamespace = request.attributeAxis ? undefined : defaultElementTypeNamespace;
    return steps.flatMap((step) =>
        getQNameCompletionLabels(step.name, namespaces, defaultNamespace)
            .filter((label) => label.startsWith(request.namePrefix))
            .map((label): CompletionItem => ({
                label,
                kind: request.attributeAxis
                    ? CompletionItemKind.Property
                    : CompletionItemKind.Field,
                ...(step.sequenceType === undefined
                    ? {}
                    : { labelDetails: { description: formatSequenceType(step.sequenceType) } }),
                textEdit: replaceTypedPrefix(
                    context.document,
                    context.cursorOffset,
                    request.namePrefix,
                    label,
                ),
            })),
    );
}

function typedBeforeCursor(
    context: CompletionContext,
    pattern: RegExp,
): { index: number; groups: (string | undefined)[] } | null {
    const match = context.source.slice(0, context.cursorOffset).match(pattern);
    return match?.index === undefined ? null : { index: match.index, groups: [...match] };
}

/**
 * Whether the step is inside a predicate, i.e. after a `[` that is not closed before it, or on the right of `!`, where
 * the context item comes from the expression on the left. This avoids asking for a type at every expression.
 */
function setsContextItem(source: string, stepOffset: number): boolean {
    const before = source.slice(0, stepOffset);
    if (/!\s*$/.test(before)) {
        return true;
    }
    let depth = 0;
    for (let index = before.length - 1; index >= 0; index--) {
        if (before[index] === "]") {
            depth++;
        } else if (before[index] === "[") {
            if (depth === 0) {
                return true;
            }
            depth--;
        }
    }
    return false;
}

function allowsExpressionAt(context: CompletionContext, offset: number): boolean {
    const intent = context.getIntentAt(offset);
    return intent !== null && (intent.allowVariableReferences || intent.allowFunctions);
}

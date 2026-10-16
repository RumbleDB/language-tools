import { formatSequenceType } from "server/analysis/index.js";
import { getTypeAtPositionFromSource } from "server/integrations/rumble/operations/type-at-position/service.js";
import { getActiveParserId } from "server/parser/utils.js";
import { CompletionItemKind, type CompletionItem } from "vscode-languageserver";

import { getQNameCompletionLabels, replaceTypedPrefix } from "../context.js";
import type { CompletionContext, CompletionProvider } from "../types.js";

/**
 * The part of a step name typed so far, optionally after `@`. It must start a name, rather than continue a variable
 * name or another token.
 */
const STEP_PATTERN = /(?<![\w.$@:#"'-])(@?)((?:[A-Za-z_][\w.-]*:)?[\w.-]*)$/;

interface TypedStep {
    /** Where the step starts, including any `@`. */
    start: number;
    attributeAxis: boolean;
    namePrefix: string;
}

interface ContextItemReplacement {
    /** Where the context item replaces the source up to the cursor. */
    from: number;
    /** What to insert before the context item. */
    prefix: string;
    throughDescendants: boolean;
}

/** Suggests the children or attributes that the schema declares after `/` or `//` in a schema-typed path. */
export const providePathStepCompletions: CompletionProvider = async (context) => {
    const step = typedStep(context);
    if (step === null) {
        return null;
    }
    const slash = context.getTokenBefore(step.start);
    if (slash?.text !== "/" && slash?.text !== "//") {
        return null;
    }
    // An expression must be able to start at the step, which excludes strings and comments.
    if (!allowsExpressionAt(context, step.start)) {
        return null;
    }
    return completeSteps(
        context,
        step,
        // E//S applies S to E and to each of its descendants, so the steps are listed through the descendants of E.
        slash.text === "//"
            ? { from: slash.start, prefix: "/", throughDescendants: true }
            : { from: step.start, prefix: "", throughDescendants: false },
    );
};

/**
 * Replaces the step with the context item, whose type is that of the items the step applies to. Unlike the type of the
 * expression before a slash, it does not depend on which of the expressions ending there is meant.
 */
async function completeSteps(
    context: CompletionContext,
    step: TypedStep,
    replacement: ContextItemReplacement,
): Promise<CompletionItem[] | null> {
    const contextItem = getActiveParserId(context.document) === "xquery" ? "." : "$$";
    const contextItemOffset = replacement.from + replacement.prefix.length;
    const result = await getTypeAtPositionFromSource(
        context.document.uri,
        context.source.slice(0, replacement.from) +
            replacement.prefix +
            contextItem +
            context.source.slice(context.cursorOffset),
        context.document.positionAt(contextItemOffset),
        context.wrapper,
        {
            axis: step.attributeAxis ? "attribute" : "child",
            throughDescendants: replacement.throughDescendants,
        },
    );
    const pathSteps = result.pathSteps;
    if (pathSteps === undefined) {
        return null;
    }

    const { namespaces, defaultElementTypeNamespace } = await context.getAnalysis();
    // Unprefixed attribute names are in no namespace, whatever the default element namespace is.
    const defaultNamespace = step.attributeAxis ? undefined : defaultElementTypeNamespace;
    return pathSteps.flatMap((pathStep) =>
        getQNameCompletionLabels(pathStep.name, namespaces, defaultNamespace)
            .filter((label) => label.startsWith(step.namePrefix))
            .map((label): CompletionItem => ({
                label,
                kind: step.attributeAxis ? CompletionItemKind.Property : CompletionItemKind.Field,
                ...(pathStep.sequenceType === undefined
                    ? {}
                    : { labelDetails: { description: formatSequenceType(pathStep.sequenceType) } }),
                textEdit: replaceTypedPrefix(
                    context.document,
                    context.cursorOffset,
                    step.namePrefix,
                    label,
                ),
            })),
    );
}

function typedStep(context: CompletionContext): TypedStep | null {
    const match = context.source.slice(0, context.cursorOffset).match(STEP_PATTERN);
    if (match?.index === undefined) {
        return null;
    }
    const [, attributeMarker, namePrefix = ""] = match;
    return { start: match.index, attributeAxis: attributeMarker === "@", namePrefix };
}

function allowsExpressionAt(context: CompletionContext, offset: number): boolean {
    const intent = context.getIntentAt(offset);
    return intent !== null && (intent.allowVariableReferences || intent.allowFunctions);
}

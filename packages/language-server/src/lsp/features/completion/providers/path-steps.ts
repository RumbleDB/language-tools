import { Token } from "antlr4ng";
import { formatSequenceType } from "server/analysis/index.js";
import type { PathStepScope } from "server/integrations/rumble/operations/type-at-position/protocol.js";
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
    scope: PathStepScope;
}

/** Suggests the children or attributes that the schema declares after `/` or `//` in a schema-typed path. */
export const providePathStepCompletions: CompletionProvider = async (context) => {
    const step = typedStep(context);
    if (step === null) {
        return null;
    }
    const slash = previousToken(context, step.start);
    // An expression must be able to start at the step, which excludes strings and comments.
    if ((slash?.text !== "/" && slash?.text !== "//") || !allowsExpressionAt(context, step.start)) {
        return null;
    }
    return completeSteps(
        context,
        step,
        // E//S applies S to E and to each of its descendants, which the descendant scope lists for the items of E.
        slash.text === "//"
            ? { from: slash.start, prefix: "/", scope: "descendants" }
            : { from: step.start, prefix: "", scope: "children" },
    );
};

/**
 * Suggests the children or attributes that the schema declares for a schema-typed context item, as for the first step
 * in a predicate. Function and variable names remain valid there, so these suggestions are added to the others.
 */
export const provideContextItemStepCompletions: CompletionProvider = async (context) => {
    const step = typedStep(context);
    if (
        step === null ||
        !setsContextItem(context.source, step.start) ||
        !allowsExpressionAt(context, step.start)
    ) {
        return null;
    }
    // Only schema-typed nodes have declared steps, so avoid asking for the type in other modules.
    if (context.getModuleProlog().schemaImports.length === 0) {
        return null;
    }
    return completeSteps(context, step, { from: step.start, prefix: "", scope: "children" });
};

/**
 * Replaces the step with the context item, whose type is that of the items the step applies to. Unlike the type of the
 * expression before a slash, it does not depend on which of the expressions ending there is meant.
 */
async function completeSteps(
    context: CompletionContext,
    typed: TypedStep,
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
        replacement.scope,
    );
    const steps = typed.attributeAxis ? result.attributes : result.children;
    if (steps === undefined) {
        return null;
    }

    const { namespaces, defaultElementTypeNamespace } = await context.getAnalysis();
    // Unprefixed attribute names are in no namespace, whatever the default element namespace is.
    const defaultNamespace = typed.attributeAxis ? undefined : defaultElementTypeNamespace;
    return steps.flatMap((step) =>
        getQNameCompletionLabels(step.name, namespaces, defaultNamespace)
            .filter((label) => label.startsWith(typed.namePrefix))
            .map((label): CompletionItem => ({
                label,
                kind: typed.attributeAxis ? CompletionItemKind.Property : CompletionItemKind.Field,
                ...(step.sequenceType === undefined
                    ? {}
                    : { labelDetails: { description: formatSequenceType(step.sequenceType) } }),
                textEdit: replaceTypedPrefix(
                    context.document,
                    context.cursorOffset,
                    typed.namePrefix,
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

/** The last token before the offset, skipping whitespace and comments. */
function previousToken(context: CompletionContext, offset: number): Token | undefined {
    return context
        .getParseResult()
        .tokens.filter(
            (token) =>
                token.type !== Token.EOF &&
                token.channel === Token.DEFAULT_CHANNEL &&
                token.stop < offset,
        )
        .at(-1);
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

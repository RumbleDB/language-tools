import { formatSequenceType } from "server/analysis/index.js";
import { getTypeAtPositionFromSource } from "server/integrations/rumble/operations/type-at-position/service.js";
import type { AstNode } from "server/parser/types/ast.js";
import { getActiveParserId } from "server/parser/utils.js";
import { rangeContainsPosition } from "server/utils/range.js";
import { CompletionItemKind, type CompletionItem } from "vscode-languageserver";

import { getQNameCompletionLabels, replaceTypedPrefix } from "../context.js";
import type { CompletionContext, CompletionProvider } from "../types.js";

/**
 * The part of a step name typed so far, optionally after `@`. It must start a name, rather than continue a variable
 * name or another token.
 */
const STEP_PATTERN = /(?<![\w.$@:#"'-])(@?)((?:[A-Za-z_][\w.-]*:)?[\w.-]*)$/;

/** Ranks the declared steps before keywords, functions and variables, which sort from `0:`. */
const PATH_STEP_SORT_PREFIX = "0:0:";

/** The step being typed at the cursor. */
interface TypedStep {
    /** Where the step starts, including any `@`. */
    start: number;
    /** Whether the step starts with `@`, selecting attributes rather than children. */
    attributeAxis: boolean;
    /** The part of the name typed so far, which suggestions must start with. */
    namePrefix: string;
}

/**
 * How to rewrite the source so that a context item stands for the items the step applies to, and which steps to list
 * for them.
 */
interface ContextItemReplacement {
    /** Where the context item replaces the source up to the cursor. */
    from: number;
    /** What to insert before the context item, such as the `/` that remains of a `//`. */
    prefix: string;
    /** Whether to list the steps of each item and of each of its descendants, as after `//`. */
    throughDescendants: boolean;
}

/**
 * Suggests the children or attributes that the schema declares after `/` or `//` in a schema-typed path. A step may
 * also be a function call or another primary expression, such as `data()`, so these suggestions are added to the others
 * and ranked first.
 */
export const providePathStepCompletions: CompletionProvider = async (context) => {
    const step = typedStep(context);
    if (step === null) {
        return null;
    }
    const slash = context.getTokenBefore(step.start);
    if (slash?.text !== "/" && slash?.text !== "//") {
        return null;
    }
    if (!allowsExpressionAt(context, step.start)) {
        return null;
    }
    return completeSteps(
        context,
        step,
        // E//S applies S to E and to each of its descendants. Replacing // with / gives the context item the type of the
        // items of E, and the wrapper lists the steps through their descendants.
        slash.text === "//"
            ? { from: slash.start, prefix: "/", throughDescendants: true }
            : { from: step.start, prefix: "", throughDescendants: false },
    );
};

/**
 * Suggests the children or attributes that the schema declares for a schema-typed context item, as for the first step
 * in a predicate. Function and variable names remain valid there, so these suggestions are added to the others.
 */
export const provideContextItemStepCompletions: CompletionProvider = async (context) => {
    // Only schema-typed nodes have declared steps, so other modules need not look for a context item.
    if (context.getModuleProlog().schemaImports.length === 0) {
        return null;
    }
    const step = typedStep(context);
    // Steps after a slash are left to providePathStepCompletions.
    const tokenBefore = step === null ? undefined : context.getTokenBefore(step.start);
    if (
        step === null ||
        tokenBefore?.text === "/" ||
        tokenBefore?.text === "//" ||
        !hasFocusAt(context, step.start) ||
        !allowsExpressionAt(context, step.start)
    ) {
        return null;
    }
    return completeSteps(context, step, {
        from: step.start,
        prefix: "",
        throughDescendants: false,
    });
};

/**
 * Replaces the step with the context item, whose type is that of the items the step applies to. Unlike the type of the
 * expression before a slash, it does not depend on which of the expressions ending there is meant. Returns null when
 * the items are not schema-typed.
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
                sortText: `${PATH_STEP_SORT_PREFIX}${label}`,
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

/** The step name being typed at the cursor, or null when the cursor does not follow the start of a name. */
function typedStep(context: CompletionContext): TypedStep | null {
    const match = context.source.slice(0, context.cursorOffset).match(STEP_PATTERN);
    if (match?.index === undefined) {
        return null;
    }
    const [, attributeMarker, namePrefix = ""] = match;
    return { start: match.index, attributeAxis: attributeMarker === "@", namePrefix };
}

/**
 * Whether an enclosing expression gives the step its context item, as a predicate, the right of `!` or a later path
 * step does. This avoids asking for a type at every expression.
 */
function hasFocusAt(context: CompletionContext, offset: number): boolean {
    const position = context.document.positionAt(offset);
    const containsFocus = (node: AstNode): boolean =>
        node.children.some(
            (child) =>
                (child.kind === "focus" && rangeContainsPosition(child.range, position)) ||
                containsFocus(child),
        );
    return containsFocus(context.getParseResult().ast);
}

/**
 * Whether an expression can start at the offset, which excludes strings and comments. Steps check where they start,
 * since after `@` only a name can follow.
 */
function allowsExpressionAt(context: CompletionContext, offset: number): boolean {
    const intent = context.getIntentAt(offset);
    return intent !== null && (intent.allowVariableReferences || intent.allowFunctions);
}

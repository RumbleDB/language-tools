import { collectModuleProlog, formatSequenceType } from "server/analysis/index.js";
import { getTypeAtPositionFromSource } from "server/integrations/rumble/operations/type-at-position/service.js";
import type { AstNode } from "server/parser/types/ast.js";
import { getActiveParserId, previousDefaultToken } from "server/parser/utils.js";
import { rangeContainsPosition } from "server/utils/range.js";
import { CompletionItemKind, type CompletionItem } from "vscode-languageserver";

import { getQNameCompletionLabels, replaceTypedPrefix } from "../context.js";
import type { CompletionContext, CompletionProvider } from "../types.js";

/**
 * The part of a step name typed so far, optionally after `@`. It must start a name, rather than continue a variable
 * name or another token.
 */
const STEP_PATTERN = /(?<![\w.$@:#"'-])(@?)((?:[A-Za-z_][\w.-]*:)?[\w.-]*)$/;

/** Ranks the declared steps, children before attributes, before keywords, functions and variables, which sort from `0:`. */
const PATH_STEP_SORT_PREFIX = "0:0:";

/** The step being typed at the cursor. */
interface TypedStep {
    /** Where the step starts, including any `@`. */
    start: number;
    /** Whether the step typed so far starts with `@`. */
    afterAt: boolean;
    /** The part of the name typed so far, which suggestions must start with. */
    namePrefix: string;
}

/**
 * Suggests the children or attributes that the schema declares in a schema-typed path: after `/` or `//`, or for the
 * context item, as for the first step in a predicate or on the right of `!`. A step may also be a function call or
 * another primary expression, such as `data()`, so these suggestions are added to the others and ranked first.
 */
export const providePathStepCompletions: CompletionProvider = async (context) => {
    const step = typedStep(context);
    if (step === null) {
        return null;
    }
    const { ast, tokens } = context.getParseResult();
    const slash = previousDefaultToken(tokens, step.start);
    const afterSlash = slash?.text === "/" || slash?.text === "//";
    // Without a slash, the step applies to the context item. Only schema-typed nodes have declared steps, so other
    // modules need not look for one.
    if (
        !afterSlash &&
        (collectModuleProlog(context.document.uri, ast).schemaImports.length === 0 ||
            !hasFocusAt(context, step.start))
    ) {
        return null;
    }
    if (!allowsExpressionAt(context, step.start)) {
        return null;
    }
    // E//S applies S to E and to each of its descendants. Keeping only the first slash gives the context item the type
    // of the items of E, and the wrapper lists the steps through their descendants.
    return slash?.text === "//"
        ? completeSteps(context, step, slash.start + 1, true)
        : completeSteps(context, step, step.start, false);
};

/**
 * Replaces the source from `from` up to the cursor with the context item, whose type is that of the items the step
 * applies to. Unlike the type of the expression before a slash, it does not depend on which of the expressions ending
 * there is meant. Lists the steps of each item, or with throughDescendants also of each of its descendants. Returns
 * null when the items are not schema-typed.
 */
async function completeSteps(
    context: CompletionContext,
    step: TypedStep,
    from: number,
    throughDescendants: boolean,
): Promise<CompletionItem[] | null> {
    const contextItem = getActiveParserId(context.document) === "xquery" ? "." : "$$";
    const result = await getTypeAtPositionFromSource(
        context.document.uri,
        context.source.slice(0, from) + contextItem + context.source.slice(context.cursorOffset),
        context.document.positionAt(from),
        context.wrapper,
        { throughDescendants },
    );
    const pathSteps = result.pathSteps;
    if (pathSteps === undefined) {
        return null;
    }

    const { namespaces, defaultElementTypeNamespace } = await context.getAnalysis();
    const typed = context.source.slice(step.start, context.cursorOffset);
    // Children and attributes are both listed; attributes are labelled with `@`, so that the editor keeps only them
    // once `@` is typed.
    return pathSteps.flatMap((pathStep) =>
        // Unprefixed attribute names are in no namespace, whatever the default element namespace is.
        getQNameCompletionLabels(
            pathStep.name,
            namespaces,
            pathStep.attribute ? undefined : defaultElementTypeNamespace,
        )
            .filter((name) => name.startsWith(step.namePrefix))
            .map((name) => {
                const label = pathStep.attribute ? `@${name}` : name;
                const item: CompletionItem = {
                    label,
                    kind: pathStep.attribute
                        ? CompletionItemKind.Property
                        : CompletionItemKind.Field,
                    sortText: `${PATH_STEP_SORT_PREFIX}${pathStep.attribute ? 1 : 0}:${label}`,
                    textEdit: replaceTypedPrefix(
                        context.document,
                        context.cursorOffset,
                        typed,
                        label,
                    ),
                };
                // Before `@` is typed, an attribute also matches the start of its name.
                if (pathStep.attribute && !step.afterAt) {
                    item.filterText = name;
                }
                if (pathStep.sequenceType !== undefined) {
                    item.labelDetails = { description: formatSequenceType(pathStep.sequenceType) };
                }
                return item;
            }),
    );
}

/** The step name being typed at the cursor, or null when the cursor does not follow the start of a name. */
function typedStep(context: CompletionContext): TypedStep | null {
    const match = context.source.slice(0, context.cursorOffset).match(STEP_PATTERN);
    if (match?.index === undefined) {
        return null;
    }
    const [, attributeMarker, namePrefix = ""] = match;
    return { start: match.index, afterAt: attributeMarker === "@", namePrefix };
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

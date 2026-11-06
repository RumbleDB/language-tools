import { collectModuleProlog, formatSequenceType } from "server/analysis/index.js";
import type { PathStep } from "server/integrations/rumble/operations/focus-at-position/protocol.js";
import { getFocusAtPosition } from "server/integrations/rumble/operations/focus-at-position/service.js";
import { defaultTokenAt, previousDefaultToken } from "server/parser/utils.js";
import { CompletionItemKind, type CompletionItem } from "vscode-languageserver";

import { getQNameCompletionLabels, nameStart, replaceTypedPrefix } from "../context.js";
import type { CompletionContext, CompletionProvider } from "../types.js";

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
    const { ast, tokens } = context.getParseResult();
    const previous = previousDefaultToken(tokens, step.start);
    if (previous === undefined || !allowsExpressionAt(context, step.start)) {
        return null;
    }
    // Without a slash, the step applies to the context item. Only schema-typed nodes have declared steps, so other
    // modules need not look for one.
    const afterSlash = previous.text === "/" || previous.text === "//";
    if (!afterSlash && collectModuleProlog(context.document.uri, ast).schemaImports.length === 0) {
        return null;
    }
    const { pathSteps } = await getFocusAtPosition(
        context.document,
        context.document.positionAt(previous.stop + 1),
        context.wrapper,
    );
    return pathSteps === undefined ? null : stepCompletions(context, step, pathSteps);
};

async function stepCompletions(
    context: CompletionContext,
    step: TypedStep,
    pathSteps: PathStep[],
): Promise<CompletionItem[]> {
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

/** The step name being typed at the cursor, including an `@` right before it. */
function typedStep(context: CompletionContext): TypedStep {
    const { tokens } = context.getParseResult();
    const name = nameStart(tokens, context.cursorOffset);
    const afterAt = defaultTokenAt(tokens, name - 1)?.text === "@";
    return {
        start: afterAt ? name - 1 : name,
        afterAt,
        namePrefix: context.source.slice(name, context.cursorOffset),
    };
}

/**
 * Whether an expression can start at the offset, which excludes strings and comments. Steps check where they start,
 * since after `@` only a name can follow.
 */
function allowsExpressionAt(context: CompletionContext, offset: number): boolean {
    const intent = context.getIntentAt(offset);
    return intent !== null && (intent.allowVariableReferences || intent.allowFunctions);
}

import { formatSequenceType } from "server/analysis/index.js";
import type { PathStepScope } from "server/integrations/rumble/operations/type-at-position/protocol.js";
import { getTypeAtPositionFromSource } from "server/integrations/rumble/operations/type-at-position/service.js";
import { CompletionItemKind, type CompletionItem } from "vscode-languageserver";

import { getQNameCompletionLabels, replaceTypedPrefix } from "../context.js";
import type { CompletionContext, CompletionProvider } from "../types.js";

/** A `/` or `//`, optionally followed by `@`, before the cursor and the part of a name typed so far. */
const PATH_STEP_PATTERN = /(?<!\/)(\/\/?)(@?)((?:[A-Za-z_][\w.-]*:)?[\w.-]*)$/;

interface PathStepCompletionContext {
    slashOffset: number;
    scope: PathStepScope;
    attributeAxis: boolean;
    namePrefix: string;
    syntheticSource: string;
}

/** Suggests the children or attributes that the schema declares for the path's schema-typed nodes. */
export const providePathStepCompletions: CompletionProvider = async (context) => {
    const stepContext = getPathStepContext(context);
    if (stepContext === null || !allowsStepAfterSlash(context, stepContext.slashOffset)) {
        return null;
    }

    // Ask for the type of the path before the step, so the incomplete step does not prevent compilation.
    const result = await getTypeAtPositionFromSource(
        context.document.uri,
        stepContext.syntheticSource,
        context.document.positionAt(stepContext.slashOffset),
        context.wrapper,
        stepContext.scope,
    );
    const steps = stepContext.attributeAxis ? result.attributes : result.children;
    if (steps === undefined) {
        return null;
    }

    const { namespaces, defaultElementTypeNamespace } = await context.getAnalysis();
    // Unprefixed attribute names are in no namespace, whatever the default element namespace is.
    const defaultNamespace = stepContext.attributeAxis ? undefined : defaultElementTypeNamespace;
    return steps.flatMap((step) =>
        getQNameCompletionLabels(step.name, namespaces, defaultNamespace)
            .filter((label) => label.startsWith(stepContext.namePrefix))
            .map((label): CompletionItem => ({
                label,
                kind: stepContext.attributeAxis
                    ? CompletionItemKind.Property
                    : CompletionItemKind.Field,
                ...(step.sequenceType === undefined
                    ? {}
                    : { labelDetails: { description: formatSequenceType(step.sequenceType) } }),
                textEdit: replaceTypedPrefix(
                    context.document,
                    context.cursorOffset,
                    stepContext.namePrefix,
                    label,
                ),
            })),
    );
};

/** Whether an expression can start right after the first slash, which excludes strings and comments. */
function allowsStepAfterSlash(context: CompletionContext, slashOffset: number): boolean {
    const intent = context.getIntentAt(slashOffset + 1);
    return intent !== null && (intent.allowVariableReferences || intent.allowFunctions);
}

function getPathStepContext(context: CompletionContext): PathStepCompletionContext | null {
    const match = context.source.slice(0, context.cursorOffset).match(PATH_STEP_PATTERN);
    if (match?.index === undefined) {
        return null;
    }
    const [, slashes = "/", attributeMarker = "", namePrefix = ""] = match;
    return {
        slashOffset: match.index,
        // E//S applies S to E and to each of its descendants.
        scope: slashes === "//" ? "descendants" : "children",
        attributeAxis: attributeMarker === "@",
        namePrefix,
        syntheticSource:
            context.source.slice(0, match.index) + context.source.slice(context.cursorOffset),
    };
}

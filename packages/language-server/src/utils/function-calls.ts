import type { FunctionCallNode } from "../analysis/model/ast.js";
import type { SourceFunctionDefinition } from "../analysis/model/definitions.js";
import { getBuiltinFunctionDocumentation } from "../resources/function-docs.js";

export function chooseBestSignatureIndex(
    parameterCounts: number[],
    requiredArgumentCount: number,
): number {
    let smallestMatchingIndex: number | undefined;
    let largestIndex = 0;

    for (const [index, parameterCount] of parameterCounts.entries()) {
        if (parameterCount > parameterCounts[largestIndex]!) {
            largestIndex = index;
        }

        if (parameterCount < requiredArgumentCount) {
            continue;
        }

        if (
            smallestMatchingIndex === undefined ||
            parameterCount < parameterCounts[smallestMatchingIndex]!
        ) {
            smallestMatchingIndex = index;
        }
    }

    return smallestMatchingIndex ?? largestIndex;
}

function findResolvedSourceFunction(call: FunctionCallNode): SourceFunctionDefinition | undefined {
    const declaration = call.reference.resolution?.declaration;
    return declaration?.origin === "source" && declaration.kind === "function"
        ? declaration
        : undefined;
}

/**
 * The `$name` of the parameter at `index` of the function a call resolves to. A builtin with
 * several signatures uses the one that fits the call's arguments.
 */
export function getParameterName(call: FunctionCallNode, index: number): string | undefined {
    const sourceDefinition = findResolvedSourceFunction(call);
    if (sourceDefinition) {
        const parameter = sourceDefinition.parameters[index];
        return parameter === undefined ? undefined : `$${parameter.name.localName}`;
    }

    const docsEntry = getBuiltinFunctionDocumentation(call.name.qname);
    if (!docsEntry || docsEntry.signatures.length === 0) {
        return undefined;
    }

    const signature =
        docsEntry.signatures[
            chooseBestSignatureIndex(
                docsEntry.signatures.map((candidate) => candidate.params.length),
                call.arguments.length,
            )
        ]!;
    const parameter = signature.params[index];
    return parameter === undefined ? undefined : `$${parameter.name}`;
}

/** Whether the call is an arrow step, whose first argument is the expression before `=>`. */
export function isArrowCall(call: FunctionCallNode): boolean {
    return call.arguments[0]?.piped === true;
}

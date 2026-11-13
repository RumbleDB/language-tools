import type { FunctionCallNode } from "../analysis/model/ast.js";
import type { SourceFunctionDefinition } from "../analysis/model/definitions.js";

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

export function findResolvedSourceFunction(
    call: FunctionCallNode,
): SourceFunctionDefinition | undefined {
    const declaration = call.reference.resolution?.declaration;
    return declaration?.origin === "source" && declaration.kind === "function"
        ? declaration
        : undefined;
}

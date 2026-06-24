import type { Position } from "vscode-languageserver";

import type { ArgumentNode, FunctionCallNode } from "../analysis/ast.js";
import type { AnalysisResult } from "../analysis/builder.js";
import {
    isSourceFunctionDefinition,
    type Definition,
    type SourceFunctionDefinition,
} from "../analysis/definitions.js";
import { findNodesThatContainPosition } from "../analysis/queries.js";

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

export function findResolvedFunctionDeclaration(call: FunctionCallNode): Definition | undefined {
    return call.reference?.resolution?.declaration;
}

export function findResolvedSourceFunction(
    call: FunctionCallNode,
): SourceFunctionDefinition | undefined {
    const declaration = findResolvedFunctionDeclaration(call);
    return isSourceFunctionDefinition(declaration) ? declaration : undefined;
}

export function findCurrentArgument(
    analysis: AnalysisResult,
    position: Position,
): { call: FunctionCallNode; argument: ArgumentNode } | undefined {
    const containingNodes = findNodesThatContainPosition(analysis, position);
    const call = containingNodes.findLast((node) => node.kind === "function-call");
    const argument = containingNodes.findLast((node) => node.kind === "argument");

    if (!call || !argument) {
        return undefined;
    }

    return { call, argument };
}

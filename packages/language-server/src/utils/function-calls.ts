import { JsoniqAnalysis } from "server/analysis/builder.js";
import {
    Definition,
    isSourceFunctionDefinition,
    SourceFunctionDefinition,
} from "server/analysis/definitions.js";
import type { Position } from "vscode-languageserver";

import type { ArgumentNode, FunctionCallNode } from "../analysis/ast.js";
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
    const definition = findResolvedFunctionDeclaration(call);
    return isSourceFunctionDefinition(definition) ? definition : undefined;
}

export function findCurrentArgument(
    analysis: JsoniqAnalysis,
    position: Position,
): { call: FunctionCallNode; argument: ArgumentNode } | undefined {
    const containingNodes = findNodesThatContainPosition(analysis, position);
    const argument = containingNodes.findLast(
        (node): node is ArgumentNode => node.kind === "argument",
    );

    if (argument === undefined) {
        return undefined;
    }

    const call = argument.parent;

    if (call === undefined || call.kind !== "function-call") {
        return undefined;
    }

    return { call, argument };
}

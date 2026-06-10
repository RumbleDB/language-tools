import { JsoniqAnalysis } from "server/analysis/builder.js";
import {
    Definition,
    isSourceFunctionDefinition,
    SourceFunctionDefinition,
} from "server/analysis/definitions.js";
import { getW3Catalog } from "server/function-catalog/loader.js";
import type { FunctionEntry } from "server/function-catalog/types.js";
import type { Position } from "vscode-languageserver";

import type { ArgumentNode, FunctionCallNode } from "../analysis/ast.js";
import { QNameToString } from "../analysis/names.js";
import { findNodesThatContainPosition } from "../analysis/queries.js";

export function getFunctionCallName(call: FunctionCallNode): string {
    return QNameToString(call.name.qname, false);
}

export function getFunctionCallArgumentNodes(call: FunctionCallNode): ArgumentNode[] {
    return call.arguments;
}

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

export function getFunctionCatalogEntry(call: FunctionCallNode): FunctionEntry | undefined {
    return getCatalogEntryByFunctionName(getFunctionCallName(call));
}

export function getCatalogEntryByFunctionName(functionName: string): FunctionEntry | undefined {
    const [prefix = "fn", localName = functionName] = functionName.includes(":")
        ? functionName.split(":", 2)
        : [undefined, functionName];
    return getW3Catalog()[`${prefix}:${localName}`];
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

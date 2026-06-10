import { getW3Catalog } from "server/function-doc/loader.js";
import type { FunctionEntry } from "server/function-doc/types.js";
import type { ArgumentAstNode, FunctionCallAstNode } from "server/parser/types/ast.js";
import { lexicalQNameToString } from "server/parser/types/name.js";
import type { Position } from "vscode-languageserver";

import {
    isSourceFunctionDefinition,
    type Definition,
    type JsoniqAnalysis,
    type SourceFunctionDefinition,
} from "../analysis/model.js";
import { findNodesThatContainPosition, findSymbolAtPosition } from "../analysis/queries.js";

export function getFunctionCallName(call: FunctionCallAstNode): string {
    return lexicalQNameToString(call.name.qname);
}

export function getFunctionCallArgumentNodes(call: FunctionCallAstNode): ArgumentAstNode[] {
    return call.children.filter((child): child is ArgumentAstNode => child.kind === "argument");
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

export function findResolvedFunctionDeclaration(
    call: FunctionCallAstNode,
    analysis: JsoniqAnalysis,
): Definition | undefined {
    const symbol = findSymbolAtPosition(analysis, call.nameRange.start);
    return symbol?.reference?.kind === "function" ? symbol.reference.declaration : undefined;
}

export function findResolvedSourceFunction(
    call: FunctionCallAstNode,
    analysis: JsoniqAnalysis,
): SourceFunctionDefinition | undefined {
    const definition = findResolvedFunctionDeclaration(call, analysis);
    return isSourceFunctionDefinition(definition) ? definition : undefined;
}

export function getFunctionCatalogEntry(call: FunctionCallAstNode): FunctionEntry | undefined {
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
): { call: FunctionCallAstNode; argument: ArgumentAstNode } | undefined {
    const containingNodes = findNodesThatContainPosition(analysis, position);
    const argument = containingNodes.findLast(
        (node): node is ArgumentAstNode => node.kind === "argument",
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

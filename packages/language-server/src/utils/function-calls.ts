import { getW3Catalog } from "server/function-catalog/loader.js";
import type { FunctionEntry } from "server/function-catalog/types.js";
import type { ArgumentAstNode, FunctionCallAstNode } from "server/parser/types/ast.js";
import { isPrefixedQName, lexicalQNameToString } from "server/parser/types/name.js";
import { sameRange } from "server/utils/range.js";

import {
    isSourceFunctionDefinition,
    type Definition,
    type JsoniqAnalysis,
    type SourceFunctionDefinition,
} from "../analysis/model.js";
import { sameResolvedQName, type ResolvedQName } from "../analysis/names.js";

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
    const resolvedDeclaration = analysis.references.find(
        (reference) => reference.kind === "function" && sameRange(reference.range, call.nameRange),
    )?.declaration;
    if (resolvedDeclaration) {
        return resolvedDeclaration;
    }

    const functionQName = normalizeQName(call.name.qname, analysis);
    return analysis.definitions.find(
        (definition) =>
            definition.kind === "function" &&
            sameResolvedQName(definition.name.qname, functionQName),
    );
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

function normalizeQName(
    qname: FunctionCallAstNode["name"]["qname"],
    analysis: JsoniqAnalysis,
): ResolvedQName {
    const namespaceUri = isPrefixedQName(qname)
        ? analysis.namespaces.get(qname.prefix)?.namespaceUri
        : undefined;

    return {
        localName: qname.localName,
        ...(namespaceUri === undefined ? {} : { namespaceUri }),
        ...(isPrefixedQName(qname) ? { prefix: qname.prefix } : {}),
    };
}

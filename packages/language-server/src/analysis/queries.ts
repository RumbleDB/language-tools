import { comparePositions } from "server/utils/position.js";
import { rangeContainsPosition } from "server/utils/range.js";
import type { Position } from "vscode-languageserver";

import type { AstNode, SymbolOccurrence } from "./ast.js";
import { ScopeDefinition, SourceDefinition } from "./definitions.js";
import { AnyResolvedReference } from "./reference.js";
import type { AnalysisResult } from "./result.js";

export function getVisibleDeclarationsAtPosition(
    analysis: AnalysisResult,
    positionOffset: number,
): ScopeDefinition[] {
    const scope = analysis.scope.findInnermostScope(positionOffset);
    return [...scope.listVisibleDefinitions(positionOffset).values()];
}

export function getSourceDefinitions(analysis: AnalysisResult): SourceDefinition[] {
    return [...analysis.definitions].sort((left, right) =>
        comparePositions(left.range.start, right.range.start),
    );
}

export function getResolvedReferences(analysis: AnalysisResult): AnyResolvedReference[] {
    return [...analysis.references];
}

export function findSymbolAtPosition(
    analysis: AnalysisResult,
    position: Position,
): SymbolOccurrence | undefined {
    return findSymbolOccurrenceAtPosition(analysis.ast, position);
}

export function findNodeThatContainsPosition(
    analysis: AnalysisResult,
    position: Position,
): AstNode | undefined {
    return findNodesThatContainPosition(analysis, position).at(-1);
}

export function findNodesThatContainPosition(
    analysis: AnalysisResult,
    position: Position,
): AstNode[] {
    return findContainingNodePath(analysis.ast, position) ?? [];
}

function findContainingNodePath(node: AstNode, position: Position): AstNode[] | undefined {
    if (!rangeContainsPosition(node.range, position)) {
        return undefined;
    }

    for (const child of node.children) {
        const match = findContainingNodePath(child, position);
        if (match !== undefined) {
            return [node, ...match];
        }
    }

    return [node];
}

function findSymbolOccurrenceAtPosition(
    node: AstNode,
    position: Position,
): SymbolOccurrence | undefined {
    if (!rangeContainsPosition(node.range, position)) {
        return undefined;
    }

    for (const child of node.children) {
        const match = findSymbolOccurrenceAtPosition(child, position);
        if (match !== undefined) {
            return match;
        }
    }

    if (
        node.kind === "declaration" &&
        rangeContainsPosition(node.declaration.selectionRange, position)
    ) {
        return {
            range: node.declaration.selectionRange,
            declaration: node.declaration,
            reference: undefined,
        };
    }

    if (node.kind === "reference" && node.resolution !== undefined) {
        return {
            range: node.range,
            declaration: node.resolution.declaration,
            reference: node.resolution,
        };
    }

    return undefined;
}

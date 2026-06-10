import { comparePositions } from "server/utils/position.js";
import { rangeContainsPosition } from "server/utils/range.js";
import type { Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { AstNode, SymbolOccurrence } from "./ast.js";
import { JsoniqAnalysis } from "./builder.js";
import { BaseDefinition, SourceDefinition } from "./definitions.js";
import { ResolvedReference } from "./reference.js";
import { getAnalysis } from "./service.js";

export async function getVisibleDeclarationsAtPosition(
    document: TextDocument,
    position: Position,
): Promise<BaseDefinition[]> {
    const analysis = await getAnalysis(document);
    const positionOffset = document.offsetAt(position);
    const scope = analysis.scope.findInnermostScope(positionOffset);
    return [...scope.listVisibleDefinitions(positionOffset).values()];
}

export function collectDefinitions(analysis: JsoniqAnalysis): SourceDefinition[] {
    const definitions: SourceDefinition[] = [];
    visitNodes(analysis.ast, (node) => {
        if (node.kind === "declaration") {
            definitions.push(node.declaration);
        }
    });

    return definitions.sort((left, right) => comparePositions(left.range.start, right.range.start));
}

export function collectReferences(analysis: JsoniqAnalysis): ResolvedReference[] {
    const references: ResolvedReference[] = [];
    visitNodes(analysis.ast, (node) => {
        if (node.kind === "reference" && node.resolution !== undefined) {
            references.push(node.resolution);
        }
    });

    return references;
}

export function findSymbolAtPosition(
    analysis: JsoniqAnalysis,
    position: Position,
): SymbolOccurrence | undefined {
    return findSymbolOccurrenceAtPosition(analysis.ast, position);
}

export function findNodeThatContainsPosition(
    analysis: JsoniqAnalysis,
    position: Position,
): AstNode | undefined {
    return findNodesThatContainPosition(analysis, position).at(-1);
}

export function findNodesThatContainPosition(
    analysis: JsoniqAnalysis,
    position: Position,
): AstNode[] {
    return findContainingNodePath(analysis.ast, position) ?? [];
}

function visitNodes(node: AstNode, callback: (node: AstNode) => void): void {
    callback(node);
    for (const child of node.children) {
        visitNodes(child, callback);
    }
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

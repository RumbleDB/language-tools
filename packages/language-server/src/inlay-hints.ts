import { parseDocument } from "server/parser/index.js";
import type { ArgumentAstNode, AstNode, FunctionCallAstNode } from "server/parser/types/ast.js";
import { InlayHintKind, type InlayHint, type Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { type JsoniqAnalysis } from "./analysis/model.js";
import { getAnalysis } from "./analysis/service.js";
import {
    chooseBestSignatureIndex,
    findResolvedSourceFunction,
    getFunctionCallArgumentNodes,
    getFunctionCatalogEntry,
} from "./utils/function-calls.js";

export async function collectInlayHints(
    document: TextDocument,
    range: Range,
): Promise<InlayHint[]> {
    const parsed = parseDocument(document);
    const analysis = await getAnalysis(document);
    const hints: InlayHint[] = [];

    collectFunctionCallInlayHints(parsed.ast, range, analysis, hints);

    return hints;
}

function collectFunctionCallInlayHints(
    node: AstNode,
    range: Range,
    analysis: JsoniqAnalysis,
    hints: InlayHint[],
): void {
    if (node.kind === "function-call" && rangesIntersect(node.range, range)) {
        hints.push(...createFunctionCallHints(node, analysis));
    }

    for (const child of node.children) {
        if (rangesIntersect(child.range, range)) {
            collectFunctionCallInlayHints(child, range, analysis, hints);
        }
    }
}

function createFunctionCallHints(call: FunctionCallAstNode, analysis: JsoniqAnalysis): InlayHint[] {
    const parameterNames = getParameterNames(call, analysis);
    if (parameterNames.length === 0) {
        return [];
    }

    return getFunctionCallArgumentNodes(call)
        .map((argument, index) => createParameterHint(argument, parameterNames[index]))
        .filter((hint): hint is InlayHint => hint !== null);
}

function createParameterHint(
    argument: ArgumentAstNode,
    parameterName: string | undefined,
): InlayHint | null {
    if (parameterName === undefined) {
        return null;
    }

    return {
        position: argument.range.start,
        kind: InlayHintKind.Parameter,
        label: `${parameterName}: `,
        paddingRight: true,
    };
}

function getParameterNames(call: FunctionCallAstNode, analysis: JsoniqAnalysis): string[] {
    const sourceDefinition = findResolvedSourceFunction(call, analysis);
    if (sourceDefinition) {
        return sourceDefinition.parameters.map((parameter) => `$${parameter.name.qname.localName}`);
    }

    return getBuiltinParameterNames(call);
}

function getBuiltinParameterNames(call: FunctionCallAstNode): string[] {
    const catalogEntry = getFunctionCatalogEntry(call);

    if (!catalogEntry || catalogEntry.signatures.length === 0) {
        return [];
    }

    const signature =
        catalogEntry.signatures[
            chooseBestSignatureIndex(
                catalogEntry.signatures.map((candidate) => candidate.params.length),
                getFunctionCallArgumentNodes(call).length,
            )
        ]!;

    return signature.params.map((parameter) => `$${parameter.name}`);
}

function rangesIntersect(left: Range, right: Range): boolean {
    return !(isBefore(left.end, right.start) || isBefore(right.end, left.start));
}

function isBefore(left: Range["start"], right: Range["start"]): boolean {
    return left.line < right.line || (left.line === right.line && left.character < right.character);
}

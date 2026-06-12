import { InlayHintKind, type InlayHint, type Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { ArgumentNode, AstNode, FunctionCallNode } from "./analysis/ast.js";
import { getAnalysis } from "./analysis/service.js";
import { getBuiltinFunctionDocumentation } from "./assets/function-docs.js";
import { chooseBestSignatureIndex, findResolvedSourceFunction } from "./utils/function-calls.js";
import { rangesIntersect } from "./utils/range.js";

export async function collectInlayHints(
    document: TextDocument,
    range: Range,
): Promise<InlayHint[]> {
    const analysis = await getAnalysis(document);
    return collectFunctionCallInlayHints(analysis.ast, range);
}

function collectFunctionCallInlayHints(node: AstNode, range: Range): InlayHint[] {
    if (!rangesIntersect(node.range, range)) {
        return [];
    }

    return [
        ...(node.kind === "function-call" ? createFunctionCallHints(node) : []),
        ...node.children.flatMap((child) => collectFunctionCallInlayHints(child, range)),
    ];
}

function createFunctionCallHints(call: FunctionCallNode): InlayHint[] {
    return call.arguments
        .map((argument) => createParameterHint(argument, getParameterName(call, argument)))
        .filter((hint): hint is InlayHint => hint !== null);
}

function createParameterHint(
    argument: ArgumentNode,
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

function getParameterName(call: FunctionCallNode, argument: ArgumentNode): string | undefined {
    const sourceDefinition = findResolvedSourceFunction(call);

    if (sourceDefinition) {
        const parameter = sourceDefinition.parameters[argument.index];
        return parameter === undefined ? undefined : `$${parameter.name.localName}`;
    }

    return getBuiltinParameterName(call, argument.index);
}

function getBuiltinParameterName(
    call: FunctionCallNode,
    argumentIndex: number,
): string | undefined {
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

    const parameter = signature.params[argumentIndex];
    return parameter === undefined ? undefined : `$${parameter.name}`;
}

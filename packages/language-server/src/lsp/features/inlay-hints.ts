import type { ArgumentNode, AstNode, FunctionCallNode } from "server/analysis/index.js";
import { findResolvedSourceFunction, getParameterName } from "server/utils/function-calls.js";
import { rangesIntersect } from "server/utils/range.js";
import type { WorkspaceService } from "server/workspace/service.js";
import {
    InlayHintKind,
    MarkupKind,
    type InlayHint,
    type InlayHintLabelPart,
    type Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

/** The longest operand the tooltip of an arrow's hint quotes in full. */
const MAX_OPERAND_LENGTH = 200;

export function registerInlayHints({
    connection,
    documents,
    workspace,
}: FeatureRegistrationContext): void {
    connection.languages.inlayHint.on((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined ? [] : collectInlayHints(document, params.range, workspace);
    });
}

export async function collectInlayHints(
    document: TextDocument,
    range: Range,
    workspace: WorkspaceService,
): Promise<InlayHint[]> {
    const analysis = await workspace.getAnalysis(document);
    return collectFunctionCallInlayHints(document, analysis.ast, range);
}

function collectFunctionCallInlayHints(
    document: TextDocument,
    node: AstNode,
    range: Range,
): InlayHint[] {
    if (!rangesIntersect(node.range, range)) {
        return [];
    }

    return [
        ...(node.kind === "function-call" ? createFunctionCallHints(document, node) : []),
        ...node.children.flatMap((child) => collectFunctionCallInlayHints(document, child, range)),
    ];
}

function createFunctionCallHints(document: TextDocument, call: FunctionCallNode): InlayHint[] {
    return call.arguments
        .map((argument) => createParameterHint(document, call, argument))
        .filter((hint): hint is InlayHint => hint !== null);
}

function createParameterHint(
    document: TextDocument,
    call: FunctionCallNode,
    argument: ArgumentNode,
): InlayHint | null {
    const parameterName = getParameterName(call, argument.index);
    if (parameterName === undefined) {
        return null;
    }

    if (!argument.piped) {
        return {
            position: argument.range.start,
            kind: InlayHintKind.Parameter,
            label: `${parameterName}: `,
            paddingRight: true,
        };
    }

    // An arrow's operand starts where the previous step does, so a hint there would stack along
    // a chain. Name the parameter it fills before the function name instead: `$s => $input: tokenize(…)`.
    return {
        position: call.selectionRange.start,
        kind: InlayHintKind.Parameter,
        label: [createOperandLabelPart(document, call, argument, parameterName)],
        paddingRight: true,
    };
}

/** The hint's text, with the operand it stands for as a tooltip and the parameter as a link. */
function createOperandLabelPart(
    document: TextDocument,
    call: FunctionCallNode,
    argument: ArgumentNode,
    parameterName: string,
): InlayHintLabelPart {
    const operand = document.getText(argument.range);
    const quoted =
        operand.length > MAX_OPERAND_LENGTH ? `${operand.slice(0, MAX_OPERAND_LENGTH)}…` : operand;
    const parameter = findResolvedSourceFunction(call)?.parameters[argument.index];

    return {
        value: `${parameterName}: `,
        tooltip: {
            kind: MarkupKind.Markdown,
            value: `Filled by the expression before \`=>\`:\n\n\`\`\`jsoniq\n${quoted}\n\`\`\``,
        },
        ...(parameter !== undefined && {
            location: { uri: parameter.uri, range: parameter.selectionRange },
        }),
    };
}

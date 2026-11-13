import type { ArgumentNode, AstNode, FunctionCallNode } from "server/analysis/index.js";
import { getParameterName } from "server/utils/function-calls.js";
import { rangesIntersect } from "server/utils/range.js";
import type { WorkspaceService } from "server/workspace/service.js";
import { InlayHintKind, type InlayHint, type Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

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
        .map((argument) => createParameterHint(call, argument))
        .filter((hint): hint is InlayHint => hint !== null);
}

function createParameterHint(call: FunctionCallNode, argument: ArgumentNode): InlayHint | null {
    const parameterName = getParameterName(call, argument.index);
    if (parameterName === undefined) {
        return null;
    }

    // An arrow's operand starts where the previous step does, so a hint there would stack along
    // a chain. Name the parameter it fills before the function name instead: `$s => $input ⇐ tokenize(…)`.
    return argument.piped
        ? {
              position: call.selectionRange.start,
              kind: InlayHintKind.Parameter,
              label: `${parameterName} ⇐`,
              paddingRight: true,
          }
        : {
              position: argument.range.start,
              kind: InlayHintKind.Parameter,
              label: `${parameterName}: `,
              paddingRight: true,
          };
}

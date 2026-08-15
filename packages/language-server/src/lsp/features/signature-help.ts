import type { ArgumentNode, AstNode, FunctionCallNode } from "server/analysis/ast.js";
import {
    definitionNameToString,
    type DefinitionByReferenceKind,
} from "server/analysis/definitions.js";
import { FunctionName, QNameToString } from "server/analysis/names.js";
import { findNodesThatContainPosition } from "server/analysis/queries.js";
import {
    FunctionDocEntry,
    getBuiltinFunctionDocumentation,
} from "server/resources/function-docs.js";
import { chooseBestSignatureIndex } from "server/utils/function-calls.js";
import type { WorkspaceService } from "server/workspace/service.js";
import {
    MarkupKind,
    type Position,
    type SignatureHelp,
    type SignatureInformation,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

export function registerSignatureHelp({
    connection,
    documents,
    workspace,
}: FeatureRegistrationContext): void {
    connection.onSignatureHelp((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined
            ? null
            : findSignatureHelp(document, params.position, workspace);
    });
}

function createSignatureInformation(
    functionName: string,
    parameters: { label: string; documentation?: string }[],
    documentationSections: string[],
    returnType?: string,
): SignatureInformation {
    const signature: SignatureInformation = {
        label:
            `${functionName}(${parameters.map((parameter) => parameter.label).join(", ")})` +
            (returnType ? ` as ${returnType}` : ""),
        parameters: parameters.map((parameter) => ({
            label: parameter.label,
            ...(parameter.documentation === undefined
                ? {}
                : {
                      documentation: {
                          kind: MarkupKind.Markdown,
                          value: parameter.documentation,
                      },
                  }),
        })),
    };

    if (documentationSections.length > 0) {
        signature.documentation = {
            kind: MarkupKind.Markdown,
            value: documentationSections.join("\n\n"),
        };
    }

    return signature;
}

function getDocumentationSections(entry: FunctionDocEntry): string[] {
    return [
        entry.summary,
        entry.rules && `**Rules:**\n${entry.rules}`,
        entry.examples && `**Examples:**\n${entry.examples}`,
    ].filter((section): section is string => Boolean(section));
}

function getBuiltinSignatures(functionName: FunctionName): SignatureInformation[] | null {
    const docsEntry = getBuiltinFunctionDocumentation(functionName.qname);
    if (!docsEntry || docsEntry.signatures.length === 0) {
        return null;
    }

    const documentationSections = getDocumentationSections(docsEntry);
    return docsEntry.signatures.map((signature) =>
        createSignatureInformation(
            QNameToString(functionName.qname, false),
            signature.params.map((parameter) => {
                const label =
                    `$${parameter.name}` +
                    (parameter.type ? ` as ${parameter.type}` : "") +
                    (parameter.default !== undefined ? ` = ${parameter.default}` : "");
                return {
                    label,
                    ...(parameter.usage === undefined ? {} : { documentation: parameter.usage }),
                };
            }),
            documentationSections,
            signature.returnType,
        ),
    );
}

function getSourceSignatures(
    functionDeclaration: DefinitionByReferenceKind["function"] | undefined,
): SignatureInformation[] | null {
    if (functionDeclaration?.origin !== "source" || functionDeclaration.kind !== "function") {
        return null;
    }

    return [
        createSignatureInformation(
            QNameToString(functionDeclaration.name.qname, false),
            functionDeclaration.parameters.map((parameter) => ({
                label: definitionNameToString(parameter),
            })),
            [],
        ),
    ];
}

function resolveSignatures(
    call: FunctionCallNode,
    activeParameter: number,
): { signatures: SignatureInformation[]; activeSignature: number } {
    const resolvedDeclaration = call.reference.resolution?.declaration;
    const builtinSignatures = getBuiltinSignatures(call.name);
    if (builtinSignatures) {
        return {
            signatures: builtinSignatures,
            activeSignature: chooseBestSignatureIndex(
                builtinSignatures.map((signature) => signature.parameters?.length ?? 0),
                activeParameter + 1,
            ),
        };
    }

    const sourceSignatures = getSourceSignatures(resolvedDeclaration);
    if (sourceSignatures) {
        return {
            signatures: sourceSignatures,
            activeSignature: 0,
        };
    }

    return {
        signatures: [{ label: `${QNameToString(call.name.qname, false)}(...)`, parameters: [] }],
        activeSignature: 0,
    };
}

function getActiveParameter(call: FunctionCallNode, containingNodes: AstNode[]): number {
    const activeArgumentNode = containingNodes.findLast(
        (node): node is ArgumentNode => node.kind == "argument",
    );
    if (activeArgumentNode !== undefined) {
        return Math.max(0, call.arguments.indexOf(activeArgumentNode));
    }

    const trailingArgument = call.arguments.at(-1);
    return trailingArgument?.children.length === 0 ? Math.max(0, call.arguments.length - 1) : 0;
}

export function findSignatureHelp(
    document: TextDocument,
    position: Position,
    workspace: WorkspaceService,
): SignatureHelp | null {
    const analysis = workspace.getAnalysis(document);
    const containingNodes = findNodesThatContainPosition(analysis, position);

    const activeCall = containingNodes.findLast((node) => node.kind == "function-call");
    if (!activeCall) {
        return null;
    }

    const activeParameter = getActiveParameter(activeCall, containingNodes);

    const { signatures, activeSignature } = resolveSignatures(activeCall, activeParameter);

    return {
        signatures,
        activeSignature,
        activeParameter,
    };
}

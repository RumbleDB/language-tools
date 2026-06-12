import { FunctionName, QNameToString } from "server/analysis/names.js";
import {
    MarkupKind,
    type Position,
    type SignatureHelp,
    type SignatureInformation,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { ArgumentNode, AstNode, FunctionCallNode } from "./analysis/ast.js";
import {
    definitionNameToString,
    isSourceFunctionDefinition,
    type Definition,
} from "./analysis/definitions.js";
import { findNodesThatContainPosition } from "./analysis/queries.js";
import { getAnalysis } from "./analysis/service.js";
import { FunctionDocEntry, getBuiltinFunctionDocumentation } from "./assets/function-docs.js";
import { chooseBestSignatureIndex } from "./utils/function-calls.js";

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
    functionDeclaration: Definition | undefined,
): SignatureInformation[] | null {
    if (!isSourceFunctionDefinition(functionDeclaration)) {
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
    const resolvedDeclaration = call.reference?.resolution?.declaration;
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

export async function findSignatureHelp(
    document: TextDocument,
    position: Position,
): Promise<SignatureHelp | null> {
    const analysis = await getAnalysis(document);
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

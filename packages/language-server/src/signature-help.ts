import { QNameToString } from "server/analysis/names.js";
import type { FunctionEntry } from "server/function-catalog/types.js";
import {
    MarkupKind,
    type ParameterInformation,
    type Position,
    type SignatureHelp,
    type SignatureInformation,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { FunctionCallNode } from "./analysis/ast.js";
import { definitionNameToString, isSourceFunctionDefinition } from "./analysis/definitions.js";
import { getAnalysis } from "./analysis/service.js";
import {
    chooseBestSignatureIndex,
    findCurrentArgument,
    findResolvedFunctionDeclaration,
    getCatalogEntryByFunctionName,
    getFunctionCallName,
} from "./utils/function-calls.js";

function createParameterInformation(
    offset: number,
    label: string,
    documentation?: string,
): ParameterInformation {
    const parameter: ParameterInformation = {
        label: [offset, offset + label.length],
    };

    if (documentation) {
        parameter.documentation = {
            kind: MarkupKind.Markdown,
            value: documentation,
        };
    }

    return parameter;
}

function createSignatureInformation(
    functionName: string,
    parameters: { label: string; documentation?: string }[],
    documentationSections: string[],
    returnType?: string,
): SignatureInformation {
    const labelPrefix = `${functionName}(`;
    const parameterInfos: ParameterInformation[] = [];
    let offset = labelPrefix.length;

    for (const [index, parameter] of parameters.entries()) {
        parameterInfos.push(
            createParameterInformation(offset, parameter.label, parameter.documentation),
        );
        offset += parameter.label.length;
        if (index < parameters.length - 1) {
            offset += 2;
        }
    }

    const label =
        `${labelPrefix}${parameters.map((parameter) => parameter.label).join(", ")})` +
        (returnType ? ` as ${returnType}` : "");

    const signature: SignatureInformation = {
        label,
        parameters: parameterInfos,
    };

    if (documentationSections.length > 0) {
        signature.documentation = {
            kind: MarkupKind.Markdown,
            value: documentationSections.join("\n\n"),
        };
    }

    return signature;
}

function getDocumentationSections(entry: FunctionEntry): string[] {
    return [
        entry.summary,
        entry.rules && `**Rules:**\n${entry.rules}`,
        entry.examples && `**Examples:**\n${entry.examples}`,
    ].filter((section): section is string => Boolean(section));
}

function resolveBuiltinSignatures(functionName: string, activeParameter: number) {
    const catalogEntry = getCatalogEntryByFunctionName(functionName);

    if (!catalogEntry || catalogEntry.signatures.length === 0) {
        return null;
    }

    const fullFunctionName = functionName.includes(":") ? functionName : `fn:${functionName}`;
    const documentationSections = getDocumentationSections(catalogEntry);
    const signatures = catalogEntry.signatures.map((signature) =>
        createSignatureInformation(
            fullFunctionName,
            signature.params.map((parameter) => {
                const parameterInfo: { label: string; documentation?: string } = {
                    label:
                        `$${parameter.name}` +
                        (parameter.type ? ` as ${parameter.type}` : "") +
                        (parameter.default !== undefined ? ` = ${parameter.default}` : ""),
                };
                if (parameter.usage) {
                    parameterInfo.documentation = parameter.usage;
                }
                return parameterInfo;
            }),
            documentationSections,
            signature.returnType,
        ),
    );

    return {
        signatures,
        activeSignature: chooseBestSignatureIndex(
            catalogEntry.signatures.map((signature) => signature.params.length),
            activeParameter + 1,
        ),
    };
}

function resolveSourceSignatures(
    functionDeclaration: ReturnType<typeof findResolvedFunctionDeclaration>,
) {
    if (!isSourceFunctionDefinition(functionDeclaration)) {
        return null;
    }

    return {
        signatures: [
            createSignatureInformation(
                QNameToString(functionDeclaration.name.qname),
                functionDeclaration.parameters.map((parameter) => ({
                    label: definitionNameToString(parameter),
                })),
                [],
            ),
        ],
        activeSignature: 0,
    };
}

function resolveSignatures(
    call: FunctionCallNode,
    activeParameter: number,
): { signatures: SignatureInformation[]; activeSignature: number } {
    const functionName = getFunctionCallName(call);
    const resolvedDeclaration = findResolvedFunctionDeclaration(call);

    return (
        resolveBuiltinSignatures(functionName, activeParameter) ??
        resolveSourceSignatures(resolvedDeclaration) ?? {
            signatures: [{ label: `${functionName}(...)`, parameters: [] }],
            activeSignature: 0,
        }
    );
}

export async function findSignatureHelp(
    document: TextDocument,
    position: Position,
): Promise<SignatureHelp | null> {
    const analysis = await getAnalysis(document);
    const activeArgument = findCurrentArgument(analysis, position);

    if (!activeArgument) {
        return null;
    }

    const { call: activeCall, argument } = activeArgument;
    const activeParameter = argument.index;
    const { signatures, activeSignature } = resolveSignatures(activeCall, activeParameter);

    return {
        signatures,
        activeSignature,
        activeParameter,
    };
}

import type { FunctionEntry } from "server/function-catalog/types.js";
import { parseDocument } from "server/parser/index.js";
import type { ArgumentAstNode, AstNode, FunctionCallAstNode } from "server/parser/types/ast.js";
import { qnameToString } from "server/parser/types/name.js";
import { getDocumentText } from "server/parser/utils.js";
import {
    MarkupKind,
    type ParameterInformation,
    type Position,
    type SignatureHelp,
    type SignatureInformation,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { definitionNameToString, isSourceFunctionDefinition } from "./analysis/model.js";
import { getAnalysis } from "./analysis/service.js";
import {
    chooseBestSignatureIndex,
    findResolvedFunctionDeclaration,
    getCatalogEntryByFunctionName,
    getFunctionCallArgumentNodes,
    getFunctionCallName,
} from "./utils/function-calls.js";

function stripComments(text: string): string {
    let result = text;

    for (;;) {
        const commentStart = result.indexOf("(:");
        if (commentStart === -1) {
            return result;
        }

        const commentEnd = result.indexOf(":)", commentStart);
        if (commentEnd === -1) {
            return result.slice(0, commentStart);
        }

        result = result.slice(0, commentStart) + result.slice(commentEnd + 2);
    }
}

function hasOnlyWhitespaceAndComments(text: string): boolean {
    return /^\s*$/.test(stripComments(text));
}

function hasTrailingComma(text: string): boolean {
    return stripComments(text).includes(",");
}

function isActiveCall(
    call: FunctionCallAstNode,
    cursorOffset: number,
    document: TextDocument,
    documentText: string,
): boolean {
    const startOffset = document.offsetAt(call.range.start);
    if (cursorOffset < startOffset) {
        return false;
    }

    const endOffset = document.offsetAt(call.range.end);
    const isClosed = documentText[endOffset - 1] === ")";

    if (cursorOffset <= endOffset) {
        return !isClosed || cursorOffset < endOffset;
    }

    return !isClosed && hasOnlyWhitespaceAndComments(documentText.slice(endOffset, cursorOffset));
}

function findInnermostActiveCall(
    node: AstNode,
    cursorOffset: number,
    document: TextDocument,
    documentText: string,
): FunctionCallAstNode | undefined {
    let bestMatch: FunctionCallAstNode | undefined;

    if (node.kind === "function-call" && isActiveCall(node, cursorOffset, document, documentText)) {
        bestMatch = node;
    }

    for (const child of node.children) {
        const childMatch = findInnermostActiveCall(child, cursorOffset, document, documentText);
        if (!childMatch) {
            continue;
        }

        if (
            bestMatch === undefined ||
            document.offsetAt(childMatch.range.start) > document.offsetAt(bestMatch.range.start)
        ) {
            bestMatch = childMatch;
        }
    }

    return bestMatch;
}

export function getParameterIndexFromAst(
    argumentNodes: ArgumentAstNode[],
    cursorOffset: number,
    document: TextDocument,
    documentText: string,
): number {
    if (argumentNodes.length === 0) {
        return 0;
    }

    const firstArgumentStart = document.offsetAt(argumentNodes[0]!.range.start);
    if (cursorOffset < firstArgumentStart) {
        return 0;
    }

    for (const [index, argument] of argumentNodes.entries()) {
        const startOffset = document.offsetAt(argument.range.start);
        const endOffset = document.offsetAt(argument.range.end);

        if (cursorOffset >= startOffset && cursorOffset <= endOffset) {
            return index;
        }

        const nextArgument = argumentNodes[index + 1];
        if (!nextArgument) {
            continue;
        }

        const nextStartOffset = document.offsetAt(nextArgument.range.start);
        if (cursorOffset <= endOffset || cursorOffset >= nextStartOffset) {
            continue;
        }

        return hasTrailingComma(documentText.slice(endOffset, cursorOffset)) ? index + 1 : index;
    }

    const lastArgumentEnd = document.offsetAt(argumentNodes[argumentNodes.length - 1]!.range.end);
    if (cursorOffset <= lastArgumentEnd) {
        return 0;
    }

    return hasTrailingComma(documentText.slice(lastArgumentEnd, cursorOffset))
        ? argumentNodes.length
        : argumentNodes.length - 1;
}

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
                qnameToString(functionDeclaration.name.qname),
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
    call: FunctionCallAstNode,
    activeParameter: number,
    analysis: Awaited<ReturnType<typeof getAnalysis>>,
): { signatures: SignatureInformation[]; activeSignature: number } {
    const functionName = getFunctionCallName(call);
    const resolvedDeclaration = findResolvedFunctionDeclaration(call, analysis);

    return (
        resolveBuiltinSignatures(functionName, activeParameter) ??
        resolveSourceSignatures(resolvedDeclaration) ?? {
            signatures: [{ label: `${functionName}(...)`, parameters: [] }],
            activeSignature: 0,
        }
    );
}

function findActiveCall(
    ast: AstNode,
    cursorOffset: number,
    document: TextDocument,
    documentText: string,
): FunctionCallAstNode | undefined {
    return findInnermostActiveCall(ast, cursorOffset, document, documentText);
}

export async function findSignatureHelp(
    document: TextDocument,
    position: Position,
): Promise<SignatureHelp | null> {
    const parsed = parseDocument(document);
    const documentText = getDocumentText(document);
    const cursorOffset = document.offsetAt(position);
    const analysis = await getAnalysis(document);
    const activeCall = findActiveCall(parsed.ast, cursorOffset, document, documentText);

    if (!activeCall) {
        return null;
    }

    const activeParameter = getParameterIndexFromAst(
        getFunctionCallArgumentNodes(activeCall),
        cursorOffset,
        document,
        documentText,
    );
    const { signatures, activeSignature } = resolveSignatures(
        activeCall,
        activeParameter,
        analysis,
    );

    return {
        signatures,
        activeSignature,
        activeParameter,
    };
}

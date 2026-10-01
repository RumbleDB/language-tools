import {
    definitionNameToString,
    formatSequenceType,
    findNodesThatContainPosition,
    getVisibleDeclarationsAtPosition,
    sameQName,
    QNameToString,
    type ArgumentNode,
    type AstNode,
    type DefinitionByReferenceKind,
    type FunctionCallNode,
    type FunctionName,
    type SchemaConstructorDefinition,
} from "server/analysis/index.js";
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
    resolvedDeclaration: DefinitionByReferenceKind["function"] | undefined,
): { signatures: SignatureInformation[]; activeSignature: number } {
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

    if (resolvedDeclaration !== undefined && resolvedDeclaration.origin !== "source") {
        return {
            signatures: [
                createSignatureInformation(
                    QNameToString(
                        call.name.qname,
                        resolvedDeclaration.origin === "implicit" &&
                            call.name.qname.prefix === undefined,
                    ),
                    resolvedDeclaration.signature.parameterTypes.map((parameter, index) => ({
                        label: `$arg${index + 1} as ${formatSequenceType(parameter.type)}`,
                    })),
                    [],
                    formatSequenceType(resolvedDeclaration.signature.returnType),
                ),
            ],
            activeSignature: 0,
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
    workspace: WorkspaceService,
): Promise<SignatureHelp | null> {
    const analysis = await workspace.getAnalysis(document);
    const containingNodes = findNodesThatContainPosition(analysis, position);

    const activeCall = containingNodes.findLast((node) => node.kind == "function-call");
    if (!activeCall) {
        return null;
    }

    const activeParameter = getActiveParameter(activeCall, containingNodes);

    // An unfinished constructor call has no argument yet. Signature help can match
    // its expanded name while semantic resolution continues to require the correct arity.
    const resolvedDeclaration =
        activeCall.reference.resolution?.declaration ??
        getVisibleDeclarationsAtPosition(analysis, document.offsetAt(position)).find(
            (definition): definition is SchemaConstructorDefinition =>
                definition.kind === "function" &&
                definition.origin === "implicit" &&
                sameQName(definition.name.qname, activeCall.name.qname),
        );

    const { signatures, activeSignature } = resolveSignatures(
        activeCall,
        activeParameter,
        resolvedDeclaration,
    );

    return {
        signatures,
        activeSignature,
        activeParameter,
    };
}

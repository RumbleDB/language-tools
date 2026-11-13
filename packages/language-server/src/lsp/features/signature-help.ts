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
import { chooseBestSignatureIndex, isArrowCall } from "server/utils/function-calls.js";
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

/**
 * The label of an arrow step's signature, written as the step is: `$a => f($b, $c)`. The first
 * parameter stands where the operand is, so no note is needed to say what fills it. Each
 * parameter's label is its offsets in the signature label, as `$a` is outside the parentheses.
 */
function createArrowLabel(
    functionName: string,
    parameterLabels: string[],
    returnSuffix: string,
): { label: string; parameterLabels: [number, number][] } {
    const [operand, ...written] = parameterLabels;
    let label = "";
    const offsets: [number, number][] = [];
    const append = (text: string): void => {
        offsets.push([label.length, label.length + text.length]);
        label += text;
    };

    append(operand!);
    label += ` => ${functionName}(`;
    for (const [index, parameter] of written.entries()) {
        if (index > 0) label += ", ";
        append(parameter);
    }
    label += `)${returnSuffix}`;
    return { label, parameterLabels: offsets };
}

function createSignatureInformation(
    functionName: string,
    parameters: { label: string; documentation?: string }[],
    documentationSections: string[],
    returnType?: string,
    arrow = false,
): SignatureInformation {
    const returnSuffix = returnType ? ` as ${returnType}` : "";
    const labels = parameters.map((parameter) => parameter.label);
    // A function without parameters cannot be an arrow step, so it keeps the call form.
    const arrowLabel =
        arrow && labels.length > 0 ? createArrowLabel(functionName, labels, returnSuffix) : null;

    const signature: SignatureInformation = {
        label: arrowLabel?.label ?? `${functionName}(${labels.join(", ")})${returnSuffix}`,
        parameters: parameters.map((parameter, index) => ({
            label: arrowLabel?.parameterLabels[index] ?? parameter.label,
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

function getBuiltinSignatures(
    functionName: FunctionName,
    arrow: boolean,
): SignatureInformation[] | null {
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
            arrow,
        ),
    );
}

function getSourceSignatures(
    functionDeclaration: DefinitionByReferenceKind["function"] | undefined,
    arrow: boolean,
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
            undefined,
            arrow,
        ),
    ];
}

function resolveSignatures(
    call: FunctionCallNode,
    activeParameter: number,
    resolvedDeclaration: DefinitionByReferenceKind["function"] | undefined,
    functionName: string,
): { signatures: SignatureInformation[]; activeSignature: number } {
    const arrow = isArrowCall(call);
    const builtinSignatures = getBuiltinSignatures(call.name, arrow);
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
                    functionName,
                    resolvedDeclaration.signature.parameterTypes.map((parameter, index) => ({
                        label: `$arg${index + 1} as ${formatSequenceType(parameter.type)}`,
                    })),
                    [],
                    formatSequenceType(resolvedDeclaration.signature.returnType),
                    arrow,
                ),
            ],
            activeSignature: 0,
        };
    }

    const sourceSignatures = getSourceSignatures(resolvedDeclaration, arrow);
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

/**
 * The innermost call around the position, and the argument of it that holds the position.
 * The operand of an arrow is that call's first argument, but it is not written inside the
 * call's parentheses, so a position there belongs to the enclosing call instead.
 */
function findActiveCall(
    containingNodes: AstNode[],
): { call: FunctionCallNode; argument: ArgumentNode | undefined } | undefined {
    for (let index = containingNodes.length - 1; index >= 0; index--) {
        const call = containingNodes[index]!;
        if (call.kind !== "function-call") continue;

        const child = containingNodes[index + 1];
        const argument = child?.kind === "argument" ? child : undefined;
        if (argument?.piped) continue;
        return { call, argument };
    }
    return undefined;
}

function getActiveParameter(call: FunctionCallNode, argument: ArgumentNode | undefined): number {
    if (argument !== undefined) {
        return argument.index;
    }

    const trailingArgument = call.arguments.at(-1);
    if (
        trailingArgument !== undefined &&
        !trailingArgument.piped &&
        trailingArgument.children.length === 0
    ) {
        return trailingArgument.index;
    }
    // The first written argument, which follows the operand of an arrow.
    return isArrowCall(call) ? 1 : 0;
}

export async function findSignatureHelp(
    document: TextDocument,
    position: Position,
    workspace: WorkspaceService,
): Promise<SignatureHelp | null> {
    const analysis = await workspace.getAnalysis(document);
    const containingNodes = findNodesThatContainPosition(analysis, position);

    const active = findActiveCall(containingNodes);
    if (!active) {
        return null;
    }

    const activeCall = active.call;
    const activeParameter = getActiveParameter(activeCall, active.argument);

    // An unfinished constructor call has no argument yet. Signature help can match
    // its expanded name while semantic resolution continues to require the correct arity.
    const resolvedDeclaration =
        activeCall.reference.resolution?.declaration ??
        getVisibleDeclarationsAtPosition(analysis, document.offsetAt(position)).find(
            (definition): definition is SchemaConstructorDefinition =>
                definition.kind === "function" &&
                definition.origin === "schema" &&
                sameQName(definition.name.qname, activeCall.name.qname),
        );

    const { signatures, activeSignature } = resolveSignatures(
        activeCall,
        activeParameter,
        resolvedDeclaration,
        document.getText(activeCall.selectionRange),
    );

    return {
        signatures,
        activeSignature,
        activeParameter,
    };
}

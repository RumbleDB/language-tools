import {
    findSymbolAtPosition,
    type AnalysisResult,
    type Definition,
    type DefinitionKind,
    type QName,
    type SourceFunctionDefinition,
    type SourceParameterDefinition,
    type SourceTypeDefinition,
    type SourceVariableDefinition,
} from "server/analysis/index.js";
import type { AnyResolvedReference } from "server/analysis/model/reference.js";
import type { WorkspaceService } from "server/workspace/service.js";
import {
    type Position,
    type Range,
    type TextEdit,
    type WorkspaceEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

export function registerRename({
    connection,
    documents,
    workspace,
}: FeatureRegistrationContext): void {
    connection.onPrepareRename((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined ? null : prepareRename(document, params.position, workspace);
    });

    connection.onRenameRequest(async (params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined
            ? null
            : await buildRenameWorkspaceEdit(document, params.position, params.newName, workspace);
    });
}

type RenameableDeclaration =
    | SourceVariableDefinition
    | SourceParameterDefinition
    | SourceFunctionDefinition
    | SourceTypeDefinition;

interface RenameTarget {
    declaration: RenameableDeclaration;
    range: Range;
}

/**
 * Checks whether a rename operation can be performed at the given position in the document.
 * This is used for the "prepare rename" feature in the language server, returning the range to
 * highlight and the placeholder text to pre-fill the editor's rename input box.
 */
export function prepareRename(
    document: TextDocument,
    position: Position,
    workspace: WorkspaceService,
): { range: Range; placeholder: string } | null {
    const analysis = workspace.getAnalysis(document);
    const target = findRenameTarget(analysis, position);

    if (target === null) {
        return null;
    }

    const { declaration } = target;
    const qname = getTargetQName(declaration);

    return { range: target.range, placeholder: qname.localName };
}

/**
 * Builds a WorkspaceEdit representing the changes needed to rename the symbol at the given
 * position to the new name, including all references across the workspace.
 */
export async function buildRenameWorkspaceEdit(
    document: TextDocument,
    position: Position,
    newName: string,
    workspace: WorkspaceService,
): Promise<WorkspaceEdit | null> {
    const analysis = workspace.getAnalysis(document);
    const target = findRenameTarget(analysis, position);

    if (target === null) {
        return null;
    }

    const { declaration } = target;
    const isVariable = isVariableLike(declaration.kind);
    const newLocalName = extractAndValidateLocalName(newName, declaration);

    const editsByUri: Record<string, TextEdit[]> = {
        [declaration.uri]: [
            {
                range: declaration.selectionRange,
                newText: formatRenamedQName(getTargetQName(declaration), newLocalName, isVariable),
            },
        ],
    };

    const references = await workspace.getReferencesToDefinition(declaration);
    for (const reference of references) {
        (editsByUri[reference.uri] ??= []).push({
            range: reference.range,
            newText: formatRenamedQName(getTargetQName(reference), newLocalName, isVariable),
        });
    }

    return { changes: editsByUri };
}

function isVariableLike(kind: DefinitionKind): boolean {
    return kind === "variable" || kind === "parameter";
}

function isRenameableDeclaration(declaration: Definition): declaration is RenameableDeclaration {
    return (
        declaration.origin === "source" &&
        (isVariableLike(declaration.kind) ||
            declaration.kind === "function" ||
            declaration.kind === "type")
    );
}

function findRenameTarget(analysis: AnalysisResult, position: Position): RenameTarget | null {
    const occurrence = findSymbolAtPosition(analysis, position);
    if (occurrence === undefined) {
        return null;
    }

    const { declaration } = occurrence;

    if (!isRenameableDeclaration(declaration)) {
        return null;
    }

    return {
        declaration,
        range: occurrence.reference?.range ?? declaration.selectionRange,
    };
}

function getTargetQName(target: RenameableDeclaration | AnyResolvedReference): QName {
    return target.kind === "function" ? target.name.qname : target.name;
}

function formatRenamedQName(name: QName, newLocalName: string, isVariable: boolean): string {
    let result: string;
    if (name.prefix !== undefined) {
        result = `${name.prefix}:${newLocalName}`;
    } else if (name.namespaceUri !== undefined) {
        result = `Q{${name.namespaceUri}}${newLocalName}`;
    } else {
        result = newLocalName;
    }
    return isVariable ? `$${result}` : result;
}

function extractAndValidateLocalName(newName: string, declaration: RenameableDeclaration): string {
    const isVariable = isVariableLike(declaration.kind);
    const targetQName = getTargetQName(declaration);

    let raw = newName.trim();

    if (raw.length === 0) {
        throw new Error("New identifier name cannot be empty.");
    }

    if (!isVariable && raw.startsWith("$")) {
        throw new Error("Function and type names must not start with '$'.");
    }

    if (raw.includes("#")) {
        throw new Error("Rename cannot change arity; do not include an arity suffix ('#').");
    }

    if (isVariable && raw.startsWith("$")) {
        raw = raw.slice(1);
    }

    const parts = raw.split(":");
    if (parts.length > 2) {
        throw new Error("Identifier name can contain at most one namespace prefix separator ':'.");
    }

    let inputPrefix: string | undefined;
    let localName: string;

    if (parts.length === 2) {
        [inputPrefix, localName] = parts as [string, string, ...string[]];
    } else {
        localName = parts[0]!;
    }

    if (localName.length === 0) {
        throw new Error("Local identifier name cannot be empty.");
    }

    const ncNamePattern = /^[A-Za-z_][A-Za-z0-9._-]*$/;
    if (!ncNamePattern.test(localName)) {
        throw new Error(`Invalid identifier '${localName}'. Expected a valid NCName.`);
    }

    if (inputPrefix !== undefined) {
        if (targetQName.prefix === undefined) {
            throw new Error(
                `Cannot add namespace prefix '${inputPrefix}' to unprefixed identifier '${targetQName.localName}'.`,
            );
        }
        if (inputPrefix !== targetQName.prefix) {
            throw new Error(
                `Cannot change namespace prefix '${targetQName.prefix}' to '${inputPrefix}' during symbol rename.`,
            );
        }
    }

    return localName;
}

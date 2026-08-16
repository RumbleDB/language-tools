import {
    definitionNameToString,
    findSymbolAtPosition,
    type AnalysisResult,
    type QName,
    type SourceParameterDefinition,
    type SourceVariableDefinition,
} from "server/analysis/index.js";
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

interface RenameTarget {
    declaration: SourceVariableDefinition | SourceParameterDefinition;
    range: Range;
}

interface RenameValidationResult {
    valid: boolean;
    message?: string;
}

/**
 * Checks whether a rename operation can be performed at the given position in the document
 * This is used for the "prepare rename" feature in the language server, allowing the editor to determine whether to enable the rename action and what text to pre-fill in the rename input box.
 * @param document The TextDocument representing the JSONiq source code to analyze
 * @param position The Position in the document for which to prepare the rename (e.g. the position of the cursor in the editor)
 * @returns An object containing the range of text that would be renamed and a placeholder string for the new name if a rename can be performed at the given position, or null if a rename cannot be performed at that position
 */
export function prepareRename(
    document: TextDocument,
    position: Position,
    workspace: WorkspaceService,
): { range: Range; placeholder: string } | null {
    const analysis = workspace.getAnalysis(document);
    const target = findRenameTarget(analysis, position);

    if (target === null) {
        // Rename is not possible at the given position
        return null;
    }

    return {
        range: target.range,
        placeholder: definitionNameToString(target.declaration),
    };
}

/**
 * Builds a WorkspaceEdit object representing the changes needed to rename the variable at the given position in the document to the new name, including all references to that variable.
 *
 * @param document The TextDocument representing the JSONiq source code to analyze and edit
 * @param position The Position in the document for which to perform the rename (e.g. the position of the cursor in the editor)
 * @param newName The new name to assign to the variable at the given position, which must be a valid JSONiq variable name (including the leading '$' character)
 * @returns A WorkspaceEdit object representing all changes needed to rename the variable at the given position to the new name, including all references to that variable, or null if a rename cannot be performed at that position
 * @throws An error if the new name is not a valid JSONiq variable name
 */
export async function buildRenameWorkspaceEdit(
    document: TextDocument,
    position: Position,
    newName: string,
    workspace: WorkspaceService,
): Promise<WorkspaceEdit | null> {
    const validation = validateVariableName(newName);
    if (!validation.valid) {
        throw new Error(validation.message ?? "Invalid JSONiq variable name.");
    }

    const analysis = workspace.getAnalysis(document);
    const target = findRenameTarget(analysis, position);

    if (target === null) {
        return null;
    }

    const newLocalName = newName.slice(1).split(":").at(-1)!;
    const editsByUri: Record<string, TextEdit[]> = {
        [target.declaration.uri]: [
            {
                range: target.declaration.selectionRange,
                newText: renamedVariable(target.declaration.name, newLocalName),
            },
        ],
    };

    for (const reference of await workspace.getReferencesToDefinition(target.declaration)) {
        if (reference.kind !== "variable") continue;
        (editsByUri[reference.uri] ??= []).push({
            range: reference.range,
            newText: renamedVariable(reference.name, newLocalName),
        });
    }

    return {
        changes: editsByUri,
    };
}

/**
 * Finds the rename target (variable declaration and range to rename) for the variable at the given position in the document, by analyzing variable scopes and occurrences.
 * @param analysis The variable scope analysis results for the document
 * @param position The position in the document for which to find the rename target
 * @returns A RenameTarget object representing the variable declaration and range to rename for the variable at the given position, or null if no valid rename target is found
 */
function findRenameTarget(analysis: AnalysisResult, position: Position): RenameTarget | null {
    const occurrence = findSymbolAtPosition(analysis, position);
    if (occurrence === undefined) {
        return null;
    }

    if (
        occurrence.declaration.origin !== "source" ||
        (occurrence.declaration.kind !== "variable" && occurrence.declaration.kind !== "parameter")
    ) {
        return null;
    }

    return {
        declaration: occurrence.declaration,
        range: occurrence.reference?.range ?? occurrence.declaration.selectionRange,
    };
}

function renamedVariable(name: QName, localName: string): string {
    return `$${name.prefix === undefined ? "" : `${name.prefix}:`}${localName}`;
}

/**
 * Validates whether the given new name is a valid JSONiq variable name according to the JSONiq syntax rules for variable names.
 * @param newName The new variable name to validate (including the leading '$' character)
 * @returns A RenameValidationResult object indicating whether the new name is valid and, if not, providing an error message explaining why it is invalid
 */
function validateVariableName(newName: string): RenameValidationResult {
    if (!newName.startsWith("$")) {
        return {
            valid: false,
            message: "JSONiq variable names must start with '$'.",
        };
    }

    const rawName = newName.slice(1);
    if (rawName.length === 0) {
        return {
            valid: false,
            message: "JSONiq variable name cannot be empty.",
        };
    }

    const parts = rawName.split(":");
    if (parts.length > 2) {
        return {
            valid: false,
            message: "JSONiq variable name can contain at most one namespace prefix separator ':'.",
        };
    }

    const ncNamePattern = /^[A-Za-z_][A-Za-z0-9._-]*$/;
    for (const part of parts) {
        if (!ncNamePattern.test(part)) {
            return {
                valid: false,
                message:
                    "Invalid JSONiq variable name. Expected '$' followed by NCName or prefix:NCName.",
            };
        }
    }

    return { valid: true };
}

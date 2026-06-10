import {
    type Position,
    type Range,
    type TextEdit,
    type WorkspaceEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { JsoniqAnalysis } from "./analysis/builder.js";
import {
    definitionNameToString,
    isSourceDefinition,
    SourceDefinition,
} from "./analysis/definitions.js";
import { findSymbolAtPosition } from "./analysis/queries.js";
import { getAnalysis } from "./analysis/service.js";

interface RenameTarget {
    declaration: SourceDefinition;
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
export async function prepareRename(
    document: TextDocument,
    position: Position,
): Promise<{ range: Range; placeholder: string } | null> {
    const analysis = await getAnalysis(document);
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
): Promise<WorkspaceEdit | null> {
    const validation = validateVariableName(newName);
    if (!validation.valid) {
        throw new Error(validation.message ?? "Invalid JSONiq variable name.");
    }

    const analysis = await getAnalysis(document);
    const target = findRenameTarget(analysis, position);

    if (target === null) {
        return null;
    }

    const edits: TextEdit[] = [
        {
            range: target.declaration.selectionRange,
            newText: newName,
        },
    ];

    for (const reference of target.declaration.references) {
        edits.push({
            range: reference.range,
            newText: newName,
        });
    }

    return {
        changes: {
            [document.uri]: edits,
        },
    };
}

/**
 * Finds the rename target (variable declaration and range to rename) for the variable at the given position in the document, by analyzing variable scopes and occurrences.
 * @param analysis The variable scope analysis results for the document
 * @param position The position in the document for which to find the rename target
 * @returns A RenameTarget object representing the variable declaration and range to rename for the variable at the given position, or null if no valid rename target is found
 */
function findRenameTarget(analysis: JsoniqAnalysis, position: Position): RenameTarget | null {
    const occurrence = findSymbolAtPosition(analysis, position);
    if (occurrence === undefined) {
        return null;
    }

    if (!isSourceDefinition(occurrence.declaration) || occurrence.declaration.kind === "function") {
        return null;
    }

    return {
        declaration: occurrence.declaration,
        range: occurrence.reference?.range ?? occurrence.declaration.selectionRange,
    };
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

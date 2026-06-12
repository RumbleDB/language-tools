import { DiagnosticSeverity, Range, type Position, type Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { getTypeInference } from "./wrapper/type-check.js";
import type { WrapperTypeError } from "./wrapper/types.js";

export async function collectTypeDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const response = await getTypeInference(document);

    const diagnostics: Diagnostic[] = [];

    for (const error of response.body.errors) {
        diagnostics.push(toDiagnostic(document, error));
    }

    if (response.error?.position) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: response.error.position,
                end: {
                    line: response.error.position.line + 1,
                    character: 0,
                },
            },
            code: response.error.code,
            source: "jsoniq-type-inference",
            message: response.error.message,
        });
    }

    return diagnostics;
}

function toDiagnostic(document: TextDocument, error: WrapperTypeError): Diagnostic {
    const diagnosticRange = createRangeFromStartPosition(document, error, error.position);

    return {
        severity: DiagnosticSeverity.Warning,
        range: diagnosticRange,
        code: error.code,
        source: "jsoniq-type",
        message: error.message,
    };
}

/**
 * We don't have the full range of errors from the wrapper,
 * for now, we'll just return the full line as the error range
 */
function createRangeFromStartPosition(
    document: TextDocument,
    error: WrapperTypeError,
    start: Position,
): Range {
    return {
        start,
        end: {
            line: start.line + 1,
            character: 0,
        },
    };
}

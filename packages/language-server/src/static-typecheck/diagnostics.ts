import { DiagnosticSeverity, Range, type Position, type Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { getStaticTypecheck } from "./service.js";
import type { StaticTypecheckWireError } from "./types.js";

export async function collectStaticTypecheckDiagnostics(
    document: TextDocument,
): Promise<Diagnostic[]> {
    const response = await getStaticTypecheck(document);

    const diagnostics: Diagnostic[] = [];

    for (const error of response.body.errors) {
        diagnostics.push(toDiagnostic(error));
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
            source: "jsoniq-static-typecheck",
            message: response.error.message,
        });
    }

    return diagnostics;
}

function toDiagnostic(error: StaticTypecheckWireError): Diagnostic {
    const diagnosticRange = createRangeFromStartPosition(error.position);

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
function createRangeFromStartPosition(start: Position): Range {
    return {
        start,
        end: {
            line: start.line + 1,
            character: 0,
        },
    };
}

import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver";
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
    return {
        severity: DiagnosticSeverity.Warning,
        range: error.range,
        code: error.code,
        source: "jsoniq-static-typecheck",
        message: error.message,
    };
}

import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { getStaticTypecheck } from "./service.js";
import type { StaticTypecheckError } from "./types.js";

export async function collectStaticTypecheckDiagnostics(
    document: TextDocument,
): Promise<Diagnostic[]> {
    const response = await getStaticTypecheck(document);

    const diagnostics: Diagnostic[] = [];

    for (const error of response.body.errors) {
        diagnostics.push(toDiagnostic(error));
    }

    return diagnostics;
}

function toDiagnostic(error: StaticTypecheckError): Diagnostic {
    return {
        severity: DiagnosticSeverity.Warning,
        range: error.range,
        code: error.code,
        source: "jsoniq-static-typecheck",
        message: error.message,
    };
}

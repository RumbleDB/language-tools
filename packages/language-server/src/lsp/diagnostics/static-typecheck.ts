import { getStaticTypecheck } from "server/integrations/rumble/operations/static-typecheck/service.js";
import type { StaticTypecheckError } from "server/integrations/rumble/operations/static-typecheck/types.js";
import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

export async function collectStaticTypecheckDiagnostics(
    document: TextDocument,
): Promise<Diagnostic[]> {
    const response = await getStaticTypecheck(document);

    const diagnostics: Diagnostic[] = [];

    for (const error of response.body.errors) {
        if (!belongsToDocument(error, document)) continue;
        diagnostics.push(toDiagnostic(error));
    }

    return diagnostics;
}

function belongsToDocument(error: StaticTypecheckError, document: TextDocument): boolean {
    const location = error.location.trim();
    if (location.length === 0) return true;

    try {
        return new URL(location, document.uri).toString() === new URL(document.uri).toString();
    } catch {
        return location === document.uri;
    }
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

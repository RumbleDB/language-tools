import type { WrapperClient } from "server/integrations/rumble/client.js";
import { getStaticTypecheck } from "server/integrations/rumble/operations/static-typecheck/service.js";
import type { StaticTypecheckError } from "server/integrations/rumble/operations/static-typecheck/types.js";
import { documentBaseUri } from "server/parser/utils.js";
import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

export async function collectStaticTypecheckDiagnostics(
    document: TextDocument,
    wrapper: WrapperClient,
): Promise<Diagnostic[]> {
    const response = await getStaticTypecheck(document, wrapper);

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

    // Rumble locates errors by the URI the query was sent with.
    const sentUri = documentBaseUri(document.uri);
    try {
        return new URL(location, sentUri).toString() === new URL(sentUri).toString();
    } catch {
        return location === sentUri;
    }
}

/** An error that always occurs is shown as one, and one that only occurs for some values as a warning. */
function toDiagnostic(error: StaticTypecheckError): Diagnostic {
    return {
        severity: error.certain ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
        range: error.range,
        code: error.code,
        source: "jsoniq-static-typecheck",
        message: error.message,
    };
}

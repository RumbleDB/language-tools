import type { Diagnostic } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { getAnalysis } from "../workspace/service.js";

export function collectSemanticDiagnostics(document: TextDocument): readonly Diagnostic[] {
    return getAnalysis(document).diagnostics;
}

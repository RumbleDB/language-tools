import type { Diagnostic } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { WorkspaceService } from "../workspace/service.js";

export function collectSemanticDiagnostics(
    document: TextDocument,
    workspace: WorkspaceService,
): readonly Diagnostic[] {
    return workspace.getAnalysis(document).diagnostics;
}

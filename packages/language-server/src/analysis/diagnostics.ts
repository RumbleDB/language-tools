import type { Diagnostic } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { workspaceService, type WorkspaceService } from "../workspace/service.js";

export function collectSemanticDiagnostics(
    document: TextDocument,
    workspace: Pick<WorkspaceService, "getAnalysis"> = workspaceService,
): readonly Diagnostic[] {
    return workspace.getAnalysis(document).diagnostics;
}

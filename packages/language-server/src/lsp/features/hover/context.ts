import type { AnalysisResult } from "server/analysis/builder.js";
import type { WorkspaceService } from "server/workspace/service.js";
import type { Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { HoverContext } from "./types.js";

export function createHoverContext(
    document: TextDocument,
    position: Position,
    workspace: WorkspaceService,
): HoverContext {
    let analysis: AnalysisResult | undefined;

    return {
        document,
        position,
        getAnalysis() {
            analysis ??= workspace.getAnalysis(document);
            return analysis;
        },
    };
}

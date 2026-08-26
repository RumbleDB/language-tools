import type { AnalysisResult } from "server/analysis/index.js";
import type { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import type { Hover, Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

export interface HoverContext {
    document: TextDocument;
    position: Position;
    wrapper?: RumbleWrapperClient | undefined;
    getAnalysis(): AnalysisResult;
}

export type HoverProvider = (context: HoverContext) => Hover | null | Promise<Hover | null>;

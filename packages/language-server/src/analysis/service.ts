import { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { buildAnalysis, AnalysisResult } from "./builder.js";

interface CachedAnalysis {
    version: number;
    analysis: AnalysisResult;
}

const analysisCache = new Map<DocumentUri, CachedAnalysis>();

export function getAnalysis(document: TextDocument): AnalysisResult {
    return getCachedAnalysis(document).analysis;
}

function getCachedAnalysis(document: TextDocument): CachedAnalysis {
    const cached = analysisCache.get(document.uri);

    if (cached !== undefined && cached.version === document.version) {
        return cached;
    }

    const analysis = buildAnalysis(document);

    const next = {
        version: document.version,
        analysis,
    };

    analysisCache.set(document.uri, next);
    return next;
}

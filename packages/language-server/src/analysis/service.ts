import { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { buildAnalysis, JsoniqAnalysis } from "./builder.js";

interface CachedAnalysis {
    version: number;
    analysis: JsoniqAnalysis;
}

const analysisCache = new Map<DocumentUri, CachedAnalysis>();

export function getAnalysis(document: TextDocument): JsoniqAnalysis {
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

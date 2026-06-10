import { getBuiltinFunctions } from "server/wrapper/builtin-functions.js";
import { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { buildAnalysis, JsoniqAnalysis } from "./builder.js";

interface CachedAnalysis {
    version: number;
    analysis: JsoniqAnalysis;
}

const analysisCache = new Map<DocumentUri, CachedAnalysis>();

export async function getAnalysis(document: TextDocument): Promise<JsoniqAnalysis> {
    return (await getCachedAnalysis(document)).analysis;
}

async function getCachedAnalysis(document: TextDocument): Promise<CachedAnalysis> {
    const cached = analysisCache.get(document.uri);

    if (cached !== undefined && cached.version === document.version) {
        return cached;
    }

    const builtinFunctions = await getBuiltinFunctions();

    const analysis = buildAnalysis(document, builtinFunctions);

    const next = {
        version: document.version,
        analysis,
    };

    analysisCache.set(document.uri, next);
    return next;
}

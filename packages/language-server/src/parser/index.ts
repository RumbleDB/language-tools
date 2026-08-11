import type { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { getParserAdapterForDocument } from "./registry.js";
import type { ParserAdapter } from "./types/adapter.js";
import { CompletionIntent } from "./types/completion.js";
import { ParseResult } from "./types/result.js";

interface CachedParsedDocument {
    version: number;
    adapterId: string;
    adapter: ParserAdapter;
    parsed: ParseResult;
}

const parseCache = new Map<DocumentUri, CachedParsedDocument>();

export function clearParsedDocument(uri: DocumentUri): void {
    parseCache.delete(uri);
}

function getCachedParsedDocument(document: TextDocument): CachedParsedDocument {
    const adapter = getParserAdapterForDocument(document);

    if (adapter === undefined) {
        throw new Error(`No parser adapter found for document '${document.uri}'.`);
    }

    const cached = parseCache.get(document.uri);

    if (
        cached !== undefined &&
        cached.version === document.version &&
        cached.adapterId === adapter.id
    ) {
        return cached;
    }

    const parsed = adapter.parse(document);
    const next = {
        version: document.version,
        adapterId: adapter.id,
        adapter,
        parsed,
    } satisfies CachedParsedDocument;

    parseCache.set(document.uri, next);

    return next;
}

export function parseDocument(document: TextDocument): ParseResult {
    const cached = getCachedParsedDocument(document);
    return cached.parsed;
}

export function collectCompletionIntent(
    document: TextDocument,
    cursorOffset: number,
): CompletionIntent | null {
    if (getParserAdapterForDocument(document) === undefined) {
        return null;
    }

    const cached = getCachedParsedDocument(document);
    return cached.adapter.getCompletionIntent(cached.parsed, cursorOffset);
}

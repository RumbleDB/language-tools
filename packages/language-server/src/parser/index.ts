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

export class ParserService {
    private readonly cache = new Map<DocumentUri, CachedParsedDocument>();

    public clear(uri: DocumentUri): void {
        this.cache.delete(uri);
    }

    public parse(document: TextDocument): ParseResult {
        return this.getCached(document).parsed;
    }

    public collectCompletionIntent(
        document: TextDocument,
        cursorOffset: number,
    ): CompletionIntent | null {
        if (getParserAdapterForDocument(document) === undefined) return null;

        const cached = this.getCached(document);
        return cached.adapter.getCompletionIntent(cached.parsed, cursorOffset);
    }

    private getCached(document: TextDocument): CachedParsedDocument {
        const adapter = getParserAdapterForDocument(document);

        if (adapter === undefined) {
            throw new Error(`No parser adapter found for document '${document.uri}'.`);
        }

        const cached = this.cache.get(document.uri);
        if (
            cached !== undefined &&
            cached.version === document.version &&
            cached.adapterId === adapter.id
        ) {
            return cached;
        }

        const next = {
            version: document.version,
            adapterId: adapter.id,
            adapter,
            parsed: adapter.parse(document),
        } satisfies CachedParsedDocument;

        this.cache.set(document.uri, next);
        return next;
    }
}

export const parserService = new ParserService();

export function clearParsedDocument(uri: DocumentUri): void {
    parserService.clear(uri);
}

export function parseDocument(document: TextDocument): ParseResult {
    return parserService.parse(document);
}

export function collectCompletionIntent(
    document: TextDocument,
    cursorOffset: number,
): CompletionIntent | null {
    return parserService.collectCompletionIntent(document, cursorOffset);
}

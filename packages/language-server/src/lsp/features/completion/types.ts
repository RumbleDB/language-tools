import type { ScopeDefinition } from "server/analysis/index.js";
import type { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import type { CompletionIntent } from "server/parser/types/completion.js";
import type { CompletionItem } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

export interface CompletionContext {
    document: TextDocument;
    source: string;
    cursorOffset: number;
    intent: CompletionIntent;
    wrapper: RumbleWrapperClient;

    // This is a lazy getter, because computing visible declarations can be expensive and is not always needed.
    getVisibleDeclarations(): readonly ScopeDefinition[];
}

/** `null` means the provider does not apply. An empty array means it applies but has no items. */
export type CompletionProviderResult = CompletionItem[] | null;

export type CompletionProvider = (
    context: CompletionContext,
) => CompletionProviderResult | Promise<CompletionProviderResult>;

import type { AnalysisResult, ScopeDefinition } from "server/analysis/index.js";
import type { WrapperClient } from "server/integrations/rumble/client.js";
import type { CompletionIntent } from "server/parser/types/completion.js";
import type { ParseResult } from "server/parser/types/result.js";
import type { CompletionItem } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

export interface CompletionContext {
    document: TextDocument;
    source: string;
    cursorOffset: number;
    intent: CompletionIntent;
    /** The intent at another offset, such as where a step starts before an `@` that the cursor follows. */
    getIntentAt(offset: number): CompletionIntent | null;
    wrapper: WrapperClient;

    // This is a lazy getter, because computing visible declarations can be expensive and is not always needed.
    getVisibleDeclarations(): Promise<readonly ScopeDefinition[]>;
    getAnalysis(): Promise<AnalysisResult>;
    getParseResult(): ParseResult;
}

/** An item as a provider describes it, with what only the provider knows about accepting it. */
export interface ProvidedCompletionItem extends CompletionItem {
    /** What a function call item inserts alone when the arguments are already written. Not sent to the client. */
    functionName?: string;
}

/** `null` means the provider does not apply. An empty array means it applies but has no items. */
export type CompletionProviderResult = ProvidedCompletionItem[] | null;

export type CompletionProvider = (
    context: CompletionContext,
) => CompletionProviderResult | Promise<CompletionProviderResult>;

import type { Token } from "antlr4ng";
import type { AnalysisResult, ModuleProlog, ScopeDefinition } from "server/analysis/index.js";
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
    /** The prolog of the document's module, collected from its syntax tree without analyzing the module. */
    getModuleProlog(): ModuleProlog;
    getParseResult(): ParseResult;
    /** The last token before the offset, skipping whitespace and comments. */
    getTokenBefore(offset: number): Token | undefined;
}

/** `null` means the provider does not apply. An empty array means it applies but has no items. */
export type CompletionProviderResult = CompletionItem[] | null;

export type CompletionProvider = (
    context: CompletionContext,
) => CompletionProviderResult | Promise<CompletionProviderResult>;

import type { AnalysisResult, ScopeDefinition } from "server/analysis/index.js";
import type { FocusAtPositionWireResult } from "server/integrations/rumble/operations/focus-at-position/protocol.js";
import type { VariableTypes } from "server/integrations/rumble/operations/static-typecheck/variable-types.js";
import type { CompletionIntent } from "server/parser/types/completion.js";
import type { ParseResult } from "server/parser/types/result.js";
import type { CompletionItem, CompletionList } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

export interface CompletionContext {
    document: TextDocument;
    source: string;
    cursorOffset: number;
    intent: CompletionIntent;
    /** The intent at another offset, such as where a step starts before an `@` that the cursor follows. */
    getIntentAt(offset: number): CompletionIntent | null;

    // This is a lazy getter, because computing visible declarations can be expensive and is not always needed.
    getVisibleDeclarations(): Promise<readonly ScopeDefinition[]>;
    getAnalysis(): Promise<AnalysisResult>;
    getParseResult(): ParseResult;
    /**
     * What a lookup key or path step after the offset applies to. Empty once the completion request is cancelled, as
     * when the user types on, since the editor then ignores the answer.
     */
    getFocusAt(offset: number): Promise<FocusAtPositionWireResult>;
    /** The variable types that RumbleDB infers for the document, which may be from an earlier version. */
    getVariableTypes(): Promise<VariableTypes>;
}

/**
 * `null` means the provider does not apply. An empty array means it applies but has no items. An incomplete list has
 * items that may change before the user types on, so that the editor asks again rather than filtering them.
 */
export type CompletionProviderResult = CompletionItem[] | CompletionList | null;

export type CompletionProvider = (
    context: CompletionContext,
) => CompletionProviderResult | Promise<CompletionProviderResult>;

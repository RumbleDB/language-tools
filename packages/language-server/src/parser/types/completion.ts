export interface KeywordCompletion {
    label: string;
    insertText?: string;
}

export interface CompletionIntent {
    allowVariableReferences: boolean;
    allowFunctions: boolean;
    allowTypes: boolean;
    allowObjectLookup: boolean;
    allowErrorCodeTargets: boolean;
    objectLookupDotOffset?: number;
    keywords: KeywordCompletion[];
}

export type CompletionTokenContextKind =
    | "default"
    | "function-name"
    | "type-name"
    | "top-level-prolog";

export interface CompletionTokenContext {
    kind: CompletionTokenContextKind;
    allowKeywords: boolean;
    allowPrologKeywords: boolean;
    allowReferences: boolean;
    allowTypeReferences: boolean;
    /** True when the last two tokens before the cursor are `SomeName ':'`, i.e. a QName
     * prefix that hasn't been completed yet (e.g. the user typed `fn:`). In this case
     * c3 may not find function/type candidates due to the broken parse, but the intent
     * should still allow them. */
    qnamePrefix: boolean;
}

export interface LanguageKeywordCompletion {
    tokenType: number;
    label: string;
    insertText?: string;
    prologOnly?: boolean;
}

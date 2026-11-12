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
    keywords: KeywordCompletion[];
    /** Where the string literal that the cursor is in starts, at its opening quote. Nothing else is allowed there. */
    stringStart?: number;
}

export interface CompletionTokenContext {
    /** True when the last two tokens before the cursor are `SomeName ':'`, i.e. a QName
     * prefix that hasn't been completed yet (e.g. the user typed `fn:`). In this case
     * the candidates are collected before the prefix, where the name starts. */
    qnamePrefix: boolean;
}

export interface LanguageKeywordCompletion {
    tokenType: number;
    label: string;
    insertText?: string;
    /** Required continuation for a compound syntax suggestion, such as `by` in `order by`. */
    followingTokens?: number[];
    fallbackLabel?: string;
}

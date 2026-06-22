export interface KeywordCompletion {
    label: string;
    insertText?: string;
}

export interface CompletionIntent {
    allowVariableReferences: boolean;
    allowVariableDeclarations: boolean;
    allowFunctions: boolean;
    allowTypes: boolean;
    keywords: KeywordCompletion[];
}

export type CompletionTokenContextKind =
    | "default"
    | "function-name"
    | "type-name"
    | "top-level-prolog"
    | "variable-declaration";

export interface CompletionTokenContext {
    kind: CompletionTokenContextKind;
    allowKeywords: boolean;
    allowPrologKeywords: boolean;
    allowReferences: boolean;
    allowTypeReferences: boolean;
    allowVariableDeclarations: boolean;
}

export interface LanguageKeywordCompletion {
    tokenType: number;
    label: string;
    insertText?: string;
    prologOnly?: boolean;
}

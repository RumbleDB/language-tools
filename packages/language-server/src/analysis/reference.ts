import { Range } from "vscode-languageserver";

import type { DefinitionByReferenceKind } from "./definitions.js";
import type { ReferenceNameByKind } from "./names.js";

export interface Reference<K extends keyof ReferenceNameByKind> {
    readonly name: ReferenceNameByKind[K];
    readonly kind: K;
    readonly uri: string;
    readonly range: Range;
}

export interface ResolvedReference<K extends keyof ReferenceNameByKind> extends Reference<K> {
    readonly declaration: DefinitionByReferenceKind[K];
}

export type AnyResolvedReference = {
    [K in keyof ReferenceNameByKind]: ResolvedReference<K>;
}[keyof ReferenceNameByKind];

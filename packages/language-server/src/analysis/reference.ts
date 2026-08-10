import { Range } from "vscode-languageserver";

import type { DefinitionByReferenceKind } from "./definitions.js";
import type { ReferenceNameByKind } from "./names.js";

export interface Reference<K extends keyof ReferenceNameByKind> {
    name: ReferenceNameByKind[K];
    kind: K;
    uri: string;
    range: Range;
}

export interface ResolvedReference<K extends keyof ReferenceNameByKind> extends Reference<K> {
    declaration: DefinitionByReferenceKind[K];
}

export type AnyResolvedReference = {
    [K in keyof ReferenceNameByKind]: ResolvedReference<K>;
}[keyof ReferenceNameByKind];

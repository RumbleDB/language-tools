import { Range } from "vscode-languageserver";

import { Definition } from "./definitions.js";
import { ReferenceNameByKind } from "./names.js";

export interface Reference<K extends keyof ReferenceNameByKind> {
    name: ReferenceNameByKind[K];
    kind: K;
    range: Range;
}

export type AnyReference<K extends keyof ReferenceNameByKind = keyof ReferenceNameByKind> =
    K extends keyof ReferenceNameByKind ? Reference<K> : never;

export type ResolvedReference<K extends keyof ReferenceNameByKind = keyof ReferenceNameByKind> =
    AnyReference<K> & { declaration: Definition };

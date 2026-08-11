import type { Range } from "vscode-languageserver";

import { Definition, SourceDefinition } from "./definitions.js";
import type { FunctionName, ReferenceNameByKind } from "./names.js";
import { AnyResolvedReference, ResolvedReference } from "./reference.js";

export type AstNodeKind = "module" | "declaration" | "reference" | "function-call" | "argument";

export interface AstNodeBase<K extends AstNodeKind> {
    readonly kind: K;
    readonly range: Range;
    readonly children: readonly AstNode[];
}

export interface ModuleNode extends AstNodeBase<"module"> {}

export interface DeclarationNode extends AstNodeBase<"declaration"> {
    readonly declaration: SourceDefinition;
}

export interface ReferenceNode<
    K extends keyof ReferenceNameByKind,
> extends AstNodeBase<"reference"> {
    readonly referenceKind: K;
    readonly name: ReferenceNameByKind[K];
    readonly resolution: ResolvedReference<K> | undefined;
}

export type AnyReferenceNode = {
    [K in keyof ReferenceNameByKind]: ReferenceNode<K>;
}[keyof ReferenceNameByKind];

export interface FunctionCallNode extends AstNodeBase<"function-call"> {
    readonly name: FunctionName;
    readonly selectionRange: Range;
    readonly reference: ReferenceNode<"function">;
    readonly arguments: readonly ArgumentNode[];
}

export interface ArgumentNode extends AstNodeBase<"argument"> {
    readonly index: number;
}

export type AstNode =
    | ModuleNode
    | DeclarationNode
    | AnyReferenceNode
    | FunctionCallNode
    | ArgumentNode;

export interface SymbolOccurrence {
    readonly range: Range;
    readonly declaration: Definition;
    readonly reference: AnyResolvedReference | undefined;
}

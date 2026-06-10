import type { Range } from "vscode-languageserver";

import type { ResolvedFunctionName, ResolvedReferenceNameByKind } from "./names.js";
import type { Scope } from "./scope.js";
import type { Definition, ResolvedReference, SourceDefinition } from "./types.js";

export type AstNodeKind = "module" | "declaration" | "reference" | "function-call" | "argument";

export interface AstNodeBase<K extends AstNodeKind> {
    kind: K;
    range: Range;
    children: AstNode[];
    parent?: AstNode;
}

export interface ModuleNode extends AstNodeBase<"module"> {
    scope: Scope;
}

export interface DeclarationNode extends AstNodeBase<"declaration"> {
    declaration: SourceDefinition;
}

export interface ReferenceNode<
    K extends keyof ResolvedReferenceNameByKind = keyof ResolvedReferenceNameByKind,
> extends AstNodeBase<"reference"> {
    referenceKind: K;
    name: ResolvedReferenceNameByKind[K];
    resolution: ResolvedReference<K> | undefined;
}

export interface FunctionCallNode extends AstNodeBase<"function-call"> {
    name: ResolvedFunctionName;
    nameRange: Range;
    reference?: ReferenceNode<"function">;
    arguments: ArgumentNode[];
}

export interface ArgumentNode extends AstNodeBase<"argument"> {
    index: number;
}

export type AstNode =
    | ModuleNode
    | DeclarationNode
    | ReferenceNode
    | FunctionCallNode
    | ArgumentNode;

export type JsoniqAst = ModuleNode;

export interface SymbolOccurrence {
    range: Range;
    declaration: Definition;
    reference: ResolvedReference | undefined;
}

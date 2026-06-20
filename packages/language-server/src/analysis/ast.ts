import type { Range } from "vscode-languageserver";

import { Definition, SourceDefinition } from "./definitions.js";
import type { FunctionName, ReferenceNameByKind } from "./names.js";
import { ResolvedReference } from "./reference.js";

export type AstNodeKind = "module" | "declaration" | "reference" | "function-call" | "argument";

export interface AstNodeBase<K extends AstNodeKind> {
    kind: K;
    range: Range;
    children: AstNode[];
    parent?: AstNode;
}

export interface ModuleNode extends AstNodeBase<"module"> {}

export interface DeclarationNode extends AstNodeBase<"declaration"> {
    declaration: SourceDefinition;
}

export interface ReferenceNode<
    K extends keyof ReferenceNameByKind = keyof ReferenceNameByKind,
> extends AstNodeBase<"reference"> {
    referenceKind: K;
    name: ReferenceNameByKind[K];
    resolution: ResolvedReference<K> | undefined;
}

export interface FunctionCallNode extends AstNodeBase<"function-call"> {
    name: FunctionName;
    selectionRange: Range;
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

import type { Range } from "vscode-languageserver";

import type {
    LexicalFunctionName,
    LexicalQName,
    LexicalReferenceNameByKind,
    Prefix,
} from "./name.js";

export type AstNodeKind =
    | "module"
    | "namespace-declaration"
    | "context-item-declaration"
    | "type-declaration"
    | "function-declaration"
    | "variable-declaration"
    | "for-binding"
    | "let-binding"
    | "group-by-binding"
    | "count-clause"
    | "flowr-expression"
    | "catch-clause"
    | "declaration"
    | "reference"
    | "function-call"
    | "named-function-reference"
    | "variable-reference"
    | "context-item-expression"
    | "argument";

export interface AstNodeBase<K extends AstNodeKind> {
    readonly kind: K;
    readonly range: Range;
    readonly children: AstNode[];
}

export interface ModuleAstNode extends AstNodeBase<"module"> {}

export interface NamespaceDeclarationAstNode extends AstNodeBase<"namespace-declaration"> {
    readonly prefix: Prefix;
    readonly namespaceUri: string;
    readonly selectionRange: Range;
}

export interface ContextItemDeclarationAstNode extends AstNodeBase<"context-item-declaration"> {
    readonly name: LexicalQName;
    readonly selectionRange: Range;
}

export interface TypeDeclarationAstNode extends AstNodeBase<"type-declaration"> {
    readonly name: { qname: LexicalQName };
    readonly selectionRange: Range;
}

export interface AstParameter {
    readonly name: LexicalQName;
    readonly range: Range;
    readonly selectionRange: Range;
    readonly index: number;
}

export interface AstBinding {
    readonly name: LexicalQName;
    readonly range: Range;
    readonly selectionRange: Range;
}

export interface ForBindingVariable extends AstBinding {
    readonly bindingKind: "for" | "for-position";
}

export interface FunctionDeclarationAstNode extends AstNodeBase<"function-declaration"> {
    readonly name: LexicalFunctionName;
    readonly nameRange: Range;
    readonly parameters: AstParameter[];
}

export interface VariableDeclarationAstNode extends AstNodeBase<"variable-declaration"> {
    readonly binding: AstBinding;
    readonly completed: boolean;
}

export interface ForBindingAstNode extends AstNodeBase<"for-binding"> {
    readonly bindings: ForBindingVariable[];
}

export interface LetBindingAstNode extends AstNodeBase<"let-binding"> {
    readonly binding: AstBinding;
}

export interface GroupByBindingAstNode extends AstNodeBase<"group-by-binding"> {
    readonly binding: AstBinding;
}

export interface CountClauseAstNode extends AstNodeBase<"count-clause"> {
    readonly binding: AstBinding;
}

export interface FlowrExpressionAstNode extends AstNodeBase<"flowr-expression"> {}

export interface CatchClauseAstNode extends AstNodeBase<"catch-clause"> {}

export interface FunctionCallAstNode extends AstNodeBase<"function-call"> {
    readonly name: LexicalFunctionName;
    readonly nameRange: Range;
}

export interface NamedFunctionReferenceAstNode extends AstNodeBase<"named-function-reference"> {
    readonly name: LexicalFunctionName;
    readonly nameRange: Range;
}

export interface VariableReferenceAstNode extends AstNodeBase<"variable-reference"> {
    readonly name: LexicalReferenceNameByKind["variable"];
}

export interface ContextItemExpressionAstNode extends AstNodeBase<"context-item-expression"> {
    readonly name: LexicalReferenceNameByKind["variable"];
}

export interface ArgumentAstNode extends AstNodeBase<"argument"> {
    readonly index: number;
}

export type AstNode =
    | ModuleAstNode
    | NamespaceDeclarationAstNode
    | ContextItemDeclarationAstNode
    | TypeDeclarationAstNode
    | FunctionDeclarationAstNode
    | VariableDeclarationAstNode
    | ForBindingAstNode
    | LetBindingAstNode
    | GroupByBindingAstNode
    | CountClauseAstNode
    | FlowrExpressionAstNode
    | CatchClauseAstNode
    | FunctionCallAstNode
    | NamedFunctionReferenceAstNode
    | VariableReferenceAstNode
    | ContextItemExpressionAstNode
    | ArgumentAstNode;

export type JsoniqAst = ModuleAstNode;

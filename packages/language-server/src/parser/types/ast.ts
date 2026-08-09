import type { Position, Range } from "vscode-languageserver";

import type {
    LexicalFunctionName,
    LexicalQName,
    LexicalReferenceNameByKind,
    Prefix,
} from "./name.js";

export type AstNodeKind =
    | "module"
    | "module-declaration"
    | "module-import"
    | "namespace-declaration"
    | "context-item-declaration"
    | "type-declaration"
    | "function-declaration"
    | "variable-declaration"
    | "flowr-expression"
    | "catch-clause"
    | "declaration"
    | "reference"
    | "type-reference"
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

export interface ModuleDeclarationAstNode extends AstNodeBase<"module-declaration"> {
    readonly prefix: Prefix;
    readonly namespaceUri: string;
    readonly selectionRange: Range;
}

export interface ModuleImportAstNode extends AstNodeBase<"module-import"> {
    readonly prefix?: Prefix;
    readonly namespaceUri: string;
    readonly namespaceUriRange: Range;
    readonly locations: readonly { uri: string; range: Range }[];
}

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

export interface FunctionDeclarationAstNode extends AstNodeBase<"function-declaration"> {
    readonly name: LexicalFunctionName;
    readonly selectionRange: Range;
    readonly parameters: AstParameter[];
}

export interface VariableDeclarationAstNode extends AstNodeBase<"variable-declaration"> {
    readonly name: LexicalQName;
    readonly range: Range;
    readonly selectionRange: Range;
    readonly visibleFrom: Position;
}

export interface FlowrExpressionAstNode extends AstNodeBase<"flowr-expression"> {}

export interface CatchClauseAstNode extends AstNodeBase<"catch-clause"> {}

export interface FunctionCallAstNode extends AstNodeBase<"function-call"> {
    readonly name: LexicalFunctionName;
    readonly selectionRange: Range;
}

export interface NamedFunctionReferenceAstNode extends AstNodeBase<"named-function-reference"> {
    readonly name: LexicalFunctionName;
    readonly selectionRange: Range;
}

export interface VariableReferenceAstNode extends AstNodeBase<"variable-reference"> {
    readonly name: LexicalReferenceNameByKind["variable"];
}

export interface TypeReferenceAstNode extends AstNodeBase<"type-reference"> {
    readonly name: LexicalReferenceNameByKind["type"];
}

export interface ContextItemExpressionAstNode extends AstNodeBase<"context-item-expression"> {
    readonly name: LexicalReferenceNameByKind["variable"];
}

export interface ArgumentAstNode extends AstNodeBase<"argument"> {
    readonly index: number;
}

export type AstNode =
    | ModuleAstNode
    | ModuleDeclarationAstNode
    | ModuleImportAstNode
    | NamespaceDeclarationAstNode
    | ContextItemDeclarationAstNode
    | TypeDeclarationAstNode
    | FunctionDeclarationAstNode
    | VariableDeclarationAstNode
    | FlowrExpressionAstNode
    | CatchClauseAstNode
    | FunctionCallAstNode
    | TypeReferenceAstNode
    | NamedFunctionReferenceAstNode
    | VariableReferenceAstNode
    | ContextItemExpressionAstNode
    | ArgumentAstNode;

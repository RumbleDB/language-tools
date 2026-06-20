import { Parser, Token } from "antlr4ng";
import type { Diagnostic } from "vscode-languageserver";

import type { ModuleAstNode } from "./ast.js";

export interface ParseResult {
    diagnostics: Diagnostic[];
    ast: ModuleAstNode;
    parser: Parser;
    tokens: Token[];
}

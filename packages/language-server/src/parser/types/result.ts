import { type CommonTokenStream, Parser, type ParserRuleContext, Token } from "antlr4ng";
import type { Diagnostic } from "vscode-languageserver";

import type { ModuleAstNode } from "./ast.js";

export interface ParseResult {
    diagnostics: Diagnostic[];
    ast: ModuleAstNode;
    parser: Parser;
    tokens: Token[];
    /** Raw ANTLR CST root — used by the formatter for full syntactic access. */
    tree: ParserRuleContext;
    /** Token stream including HIDDEN channel — used by the formatter for comment preservation. */
    tokenStream: CommonTokenStream;
}

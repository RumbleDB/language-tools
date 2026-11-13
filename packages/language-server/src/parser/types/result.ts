import { type CommonTokenStream, Parser, Token } from "antlr4ng";
import type { Diagnostic } from "vscode-languageserver";

import type { ModuleAndThisIsItContext } from "../context.js";

export interface ParseResult {
    diagnostics: Diagnostic[];
    parser: Parser;
    tokens: Token[];
    /** The parse tree, which analysis and formatting walk. */
    tree: ModuleAndThisIsItContext;
    /** Token stream including HIDDEN channel — used by the formatter for comment preservation. */
    tokenStream: CommonTokenStream;
}

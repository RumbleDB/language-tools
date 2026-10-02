import {
    CharStream,
    CommonTokenStream,
    type Lexer,
    type Parser,
    type ParserRuleContext,
} from "antlr4ng";
import { ErrorListener } from "server/parser/error-listener.js";
import type { ModuleAstNode } from "server/parser/types/ast.js";
import type { ParseResult } from "server/parser/types/result.js";
import { getDocumentText } from "server/parser/utils.js";
import type { TextDocument } from "vscode-languageserver-textdocument";

interface ParserDefinition<Tree extends ParserRuleContext> {
    readonly lexer: new (input: CharStream) => Lexer;
    readonly parser: new (tokens: CommonTokenStream) => Parser & {
        moduleAndThisIsIt(): Tree;
    };
    readonly buildAst: (tree: Tree, document: TextDocument) => ModuleAstNode;
}

/** Runs the shared parsing pipeline while preserving the language's CST and token stream. */
export function parseDocument<Tree extends ParserRuleContext>(
    document: TextDocument,
    definition: ParserDefinition<Tree>,
): ParseResult {
    const lexer = new definition.lexer(CharStream.fromString(getDocumentText(document)));
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new definition.parser(tokenStream);
    const errorListener = new ErrorListener(document);

    lexer.removeErrorListeners();
    parser.removeErrorListeners();
    lexer.addErrorListener(errorListener);
    parser.addErrorListener(errorListener);

    const tree = parser.moduleAndThisIsIt();
    tokenStream.fill();
    const tokens = tokenStream.getTokens();
    const ast = definition.buildAst(tree, document);

    return {
        parser,
        tokens,
        ast,
        diagnostics: errorListener.diagnostics,
        tree,
        tokenStream,
    };
}

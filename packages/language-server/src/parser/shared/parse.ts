import { CharStream, CommonTokenStream, type Lexer, type Parser } from "antlr4ng";
import type { ModuleAndThisIsItContext } from "server/parser/context.js";
import { ErrorListener } from "server/parser/error-listener.js";
import type { ParseResult } from "server/parser/types/result.js";
import { getDocumentText } from "server/parser/utils.js";
import type { TextDocument } from "vscode-languageserver-textdocument";

interface ParserDefinition {
    readonly lexer: new (input: CharStream) => Lexer;
    readonly parser: new (tokens: CommonTokenStream) => Parser & {
        moduleAndThisIsIt(): ModuleAndThisIsItContext;
    };
}

/** Runs the shared parsing pipeline while preserving the language's CST and token stream. */
export function parseDocument(document: TextDocument, definition: ParserDefinition): ParseResult {
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

    return {
        parser,
        tokens,
        diagnostics: errorListener.diagnostics,
        tree,
        tokenStream,
    };
}

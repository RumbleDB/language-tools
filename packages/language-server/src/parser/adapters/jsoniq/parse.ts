import { CharStream, CommonTokenStream } from "antlr4ng";
import { ErrorListener } from "server/parser/error-listener.js";
import { ParseResult } from "server/parser/types/result.js";
import { getDocumentText } from "server/parser/utils.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { buildJsoniqAst } from "./ast.js";
import { JsoniqLexer } from "./grammar/JsoniqLexer.js";
import { JsoniqParser } from "./grammar/JsoniqParser.js";

export function parseJsoniq(document: TextDocument): ParseResult {
    const { lexer, parser, tokenStream } = createParser(getDocumentText(document));
    const errorListener = new ErrorListener(document);

    lexer.removeErrorListeners();
    parser.removeErrorListeners();
    lexer.addErrorListener(errorListener);
    parser.addErrorListener(errorListener);

    const tree = parser.moduleAndThisIsIt();
    tokenStream.fill();
    const tokens = tokenStream.getTokens();
    const ast = buildJsoniqAst(tree, document);

    return {
        parser,
        tokens,
        ast,
        diagnostics: errorListener.diagnostics,
        tree,
        tokenStream,
    };
}

function createParser(source: string): {
    lexer: JsoniqLexer;
    parser: JsoniqParser;
    tokenStream: CommonTokenStream;
} {
    const input = CharStream.fromString(source);
    const lexer = new JsoniqLexer(input);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new JsoniqParser(tokenStream);

    return { lexer, parser, tokenStream };
}

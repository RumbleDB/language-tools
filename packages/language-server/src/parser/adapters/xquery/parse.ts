import { CharStream, CommonTokenStream } from "antlr4ng";
import { ErrorListener } from "server/parser/error-listener.js";
import type { ParseResult } from "server/parser/types/result.js";
import { getDocumentText, nextDefaultToken } from "server/parser/utils.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { buildXQueryAst } from "./ast.js";
import { XQueryLexer } from "./grammar/XQueryLexer.js";
import { XQueryParser } from "./grammar/XQueryParser.js";

export function parseXQuery(document: TextDocument): ParseResult {
    const { lexer, parser, tokenStream } = createParser(getDocumentText(document));
    const errorListener = new ErrorListener(document);

    lexer.removeErrorListeners();
    parser.removeErrorListeners();
    lexer.addErrorListener(errorListener);
    parser.addErrorListener(errorListener);

    const tree = parser.moduleAndThisIsIt();
    tokenStream.fill();
    const tokens = tokenStream.getTokens();
    const ast = buildXQueryAst(tree, document, nextDefaultToken(tokenStream));

    return {
        parser,
        tokens,
        ast,
        diagnostics: errorListener.diagnostics,
    };
}

function createParser(source: string): {
    lexer: XQueryLexer;
    parser: XQueryParser;
    tokenStream: CommonTokenStream;
} {
    const input = CharStream.fromString(source);
    const lexer = new XQueryLexer(input);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new XQueryParser(tokenStream);

    return { lexer, parser, tokenStream };
}

import {
    BaseErrorListener,
    CharStream,
    CommonTokenStream,
    type ATNSimulator,
    type RecognitionException,
    type Recognizer,
    Token,
} from "antlr4ng";
import type { ParseResult } from "server/parser/types/result.js";
import { getDocumentText } from "server/parser/utils.js";
import { Diagnostic, DiagnosticSeverity, type Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { buildJsoniqAst } from "./ast.js";
import { JsoniqLexer } from "./grammar/JsoniqLexer.js";
import { JsoniqParser } from "./grammar/JsoniqParser.js";

export interface JsoniqParsedDocument extends ParseResult {
    parser: JsoniqParser;
    tokens: Token[];
}

class JsoniqErrorListener extends BaseErrorListener {
    public readonly diagnostics: Diagnostic[] = [];

    public constructor(private readonly document: TextDocument) {
        super();
    }

    public override syntaxError<S extends Token, T extends ATNSimulator>(
        recognizer: Recognizer<T>,
        offendingSymbol: S | null,
        line: number,
        column: number,
        message: string,
        _error: RecognitionException | null,
    ): void {
        const range = this.createRange(offendingSymbol, line, column);

        this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range,
            message,
            source: "jsoniq",
        });
    }

    private createRange(offendingSymbol: Token | null, line: number, column: number): Range {
        if (
            offendingSymbol !== null &&
            offendingSymbol.start >= 0 &&
            offendingSymbol.stop >= offendingSymbol.start
        ) {
            return {
                start: this.document.positionAt(offendingSymbol.start),
                end: this.document.positionAt(offendingSymbol.stop + 1),
            };
        }

        const startOffset = this.document.offsetAt({
            line: Math.max(line - 1, 0),
            character: Math.max(column, 0),
        });
        const endOffset = Math.min(startOffset + 1, getDocumentText(this.document).length);

        return {
            start: this.document.positionAt(startOffset),
            end: this.document.positionAt(endOffset),
        };
    }
}

export function parseJsoniq(document: TextDocument): JsoniqParsedDocument {
    const { lexer, parser, tokenStream } = createParser(getDocumentText(document));
    const errorListener = new JsoniqErrorListener(document);

    lexer.removeErrorListeners();
    parser.removeErrorListeners();
    lexer.addErrorListener(errorListener);
    parser.addErrorListener(errorListener);

    const tree = parser.moduleAndThisIsIt();
    tokenStream.fill();
    const tokens = tokenStream.getTokens();
    const ast = buildJsoniqAst(tree, document, nextDefaultToken(tokenStream));

    return {
        parser,
        tokens,
        ast,
        diagnostics: errorListener.diagnostics,
    };
}

function nextDefaultToken(
    tokenStream: CommonTokenStream,
): (token: Token | null | undefined) => Token | null {
    return (token) => {
        if (token === null || token === undefined || token.tokenIndex < 0) {
            return null;
        }

        const nextTokenIndex = tokenStream.nextTokenOnChannel(
            token.tokenIndex + 1,
            Token.DEFAULT_CHANNEL,
        );
        return nextTokenIndex < 0 ? null : tokenStream.get(nextTokenIndex);
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

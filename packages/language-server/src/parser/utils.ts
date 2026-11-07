import {
    BailErrorStrategy,
    CharStream,
    CommonTokenStream,
    ParseCancellationException,
    Token,
} from "antlr4ng";
import { lowerBound } from "server/utils/binary-search.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { JsoniqLexer } from "./adapters/jsoniq/grammar/JsoniqLexer.js";
import { JsoniqParser } from "./adapters/jsoniq/grammar/JsoniqParser.js";

export function nextDefaultToken(
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

const compareTokenStart = (token: Token, target: number) => token.start - target;

/** The last token on the default channel that ends before the offset, skipping whitespace and comments. */
export function previousDefaultToken(tokens: Token[], offset: number): Token | undefined {
    const after = lowerBound(tokens, offset, compareTokenStart);
    for (let index = after - 1; index >= 0; index -= 1) {
        const token = tokens[index]!;
        if (token.channel === Token.DEFAULT_CHANNEL && token.stop < offset) {
            return token;
        }
    }
    return undefined;
}

/** The first token on the default channel that starts at or after the offset, skipping whitespace and comments. */
export function nextDefaultTokenAt(tokens: Token[], offset: number): Token | undefined {
    const after = lowerBound(tokens, offset, compareTokenStart);
    for (let index = after; index < tokens.length; index += 1) {
        const token = tokens[index]!;
        if (token.channel === Token.DEFAULT_CHANNEL && token.type !== Token.EOF) {
            return token;
        }
    }
    return undefined;
}

/** The token on the default channel that the offset is inside or at the start of. */
export function defaultTokenAt(tokens: Token[], offset: number): Token | undefined {
    const index = lowerBound(tokens, offset + 1, compareTokenStart) - 1;
    const token = tokens[index];
    return token?.channel === Token.DEFAULT_CHANNEL && offset <= token.stop ? token : undefined;
}

export function findCaretToken(
    tokens: Token[],
    cursorOffset: number,
    isPartialToken: (token: Token) => boolean = () => false,
): { tokenIndex: number; offset: number } {
    if (tokens.length === 0) {
        return { tokenIndex: 0, offset: cursorOffset };
    }

    const insertionPoint = lowerBound(tokens, cursorOffset, compareTokenStart);
    let tokenIndex = tokens[tokens.length - 1]!.tokenIndex;

    if (insertionPoint > 0) {
        const token = tokens[insertionPoint - 1]!;
        if (
            token.type !== Token.EOF &&
            token.start <= cursorOffset &&
            (cursorOffset <= token.stop ||
                (cursorOffset === token.stop + 1 && isPartialToken(token)))
        ) {
            tokenIndex = token.tokenIndex;
        } else if (insertionPoint < tokens.length) {
            tokenIndex = tokens[insertionPoint]!.tokenIndex;
        }
    } else if (insertionPoint < tokens.length) {
        tokenIndex = tokens[insertionPoint]!.tokenIndex;
    }

    for (let index = tokenIndex; index >= 0; index -= 1) {
        const token = tokens[index]!;
        if (
            token.type !== Token.EOF &&
            (token.channel ?? Token.DEFAULT_CHANNEL) === Token.DEFAULT_CHANNEL
        ) {
            return {
                tokenIndex,
                offset: Math.min(cursorOffset, token.stop + 1),
            };
        }
    }

    return { tokenIndex, offset: cursorOffset };
}

const JSONIQ_MAGIC_PATTERN = /^%%jsoniq\b.*(?:\r?\n|$)/;
const NOTEBOOK_CELL_URI_PREFIX = "vscode-notebook-cell:";

export function isNotebookCellDocument(document: TextDocument): boolean {
    return document.uri.startsWith(NOTEBOOK_CELL_URI_PREFIX);
}

export function hasJsoniqCellMagic(document: TextDocument): boolean {
    return isNotebookCellDocument(document) && JSONIQ_MAGIC_PATTERN.test(document.getText());
}

export function getDocumentText(document: TextDocument): string {
    const source = document.getText();

    if (!isNotebookCellDocument(document)) {
        /// For regular documents, return the text as-is
        return source;
    }

    const magicLine = source.match(JSONIQ_MAGIC_PATTERN)?.[0];
    if (magicLine === undefined) {
        return source;
    }

    /// In case of notebook cells with magic string, replace it with whitespace to prevent the parser from producing errors
    /// We don't remove it directly because then line offset will be different
    const maskedMagicLine = magicLine.replace(/[^\r\n]/g, " ");
    return `${maskedMagicLine}${source.slice(magicLine.length)}`;
}

/**
 * 1. If the document's language ID is neither JSONiq nor XQuery and the document is not part of a Jupyter Notebook cell, it is not supported by our language server.
 * 2. If the module starts with a version declaration, use the parser of the language it names.
 * 3. Otherwise, fall back to the document's language ID property.
 */
export function getActiveParserId(document: TextDocument): "xquery" | "jsoniq" | undefined {
    if (
        document.languageId !== "jsoniq" &&
        document.languageId !== "xquery" &&
        !hasJsoniqCellMagic(document)
    ) {
        return undefined;
    }

    return (
        declaredLanguage(getDocumentText(document)) ??
        (document.languageId === "xquery" ? "xquery" : "jsoniq")
    );
}

/**
 * Selects the language the way RumbleDB does, so that the server and the engine agree on it. The versionDecl rule is
 * shared by both grammars and accepts either keyword, and only the first tokens are read.
 */
function declaredLanguage(source: string): "xquery" | "jsoniq" | undefined {
    const lexer = new JsoniqLexer(CharStream.fromString(source));
    lexer.removeErrorListeners();
    const parser = new JsoniqParser(new CommonTokenStream(lexer));
    parser.removeErrorListeners();
    parser.errorHandler = new BailErrorStrategy();
    try {
        return parser.versionDecl()._language?.type === JsoniqLexer.KW_XQUERY ? "xquery" : "jsoniq";
    } catch (error) {
        if (error instanceof ParseCancellationException) {
            return undefined;
        }
        throw error;
    }
}

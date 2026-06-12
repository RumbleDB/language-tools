import { CommonTokenStream, Token } from "antlr4ng";
import { lowerBound } from "server/utils/binary-search.js";
import { TextDocument } from "vscode-languageserver-textdocument";

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

export function findCaretToken(
    tokens: Token[],
    cursorOffset: number,
): { tokenIndex: number; offset: number } {
    if (tokens.length === 0) {
        return { tokenIndex: 0, offset: cursorOffset };
    }

    const insertionPoint = lowerBound(
        tokens,
        cursorOffset,
        (token, target) => token.start - target,
    );
    let tokenIndex = tokens[tokens.length - 1]!.tokenIndex;

    if (insertionPoint > 0) {
        const token = tokens[insertionPoint - 1]!;
        if (token.type !== Token.EOF && token.start <= cursorOffset && cursorOffset <= token.stop) {
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

export function getActiveParserId(document: TextDocument): "xquery" | "jsoniq" | undefined {
    if (hasJsoniqCellMagic(document)) {
        return "jsoniq";
    }

    if (document.languageId !== "jsoniq" && document.languageId !== "xquery") {
        return undefined;
    }

    const text = document.getText();
    if (text.includes("xquery version")) {
        return "xquery";
    }
    if (text.includes("jsoniq version")) {
        return "jsoniq";
    }

    const uri = document.uri.toLowerCase();
    if (/\.(xq|xqy|xquery)$/.test(uri)) {
        return "xquery";
    }
    if (/\.(jq|jsoniq)$/.test(uri)) {
        return "jsoniq";
    }

    return document.languageId === "xquery" ? "xquery" : "jsoniq";
}

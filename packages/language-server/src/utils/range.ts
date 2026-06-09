import { ParserRuleContext, TerminalNode, type ParseTree } from "antlr4ng";
import { type Range } from "vscode-languageserver";
import { Position, TextDocument } from "vscode-languageserver-textdocument";

import { comparePositions } from "./position.js";

/**
 * Calculates the range in terms of line and character positions for a given parse tree node, which represents the position of a variable declaration or reference in the source document.
 * This is used to determine the location of variable declarations and references in the source code, which allows for features like "go to definition" to navigate to the correct position in the editor.
 * @param node The parse tree node representing the variable declaration or reference, which can be either a TerminalNode or a ParserRuleContext
 * @param document The TextDocument containing the source code, used to convert offsets to line and character positions
 * @returns A Range object representing the start and end positions of this node in terms of line and character positions in the source document
 */
export function rangeFromNode(node: ParserRuleContext | ParseTree, document: TextDocument): Range {
    if (node instanceof TerminalNode) {
        return {
            start: document.positionAt(Math.max(node.symbol.start, 0)),
            end: document.positionAt(Math.max(node.symbol.stop + 1, node.symbol.start)),
        };
    }

    if (node instanceof ParserRuleContext && node.start !== null) {
        const start = node.start.start;
        const stop = node.stop?.stop ?? node.start.stop;

        return {
            start: document.positionAt(Math.max(start, 0)),
            end: document.positionAt(Math.max(stop + 1, start)),
        };
    }

    const interval = node.getSourceInterval();
    const start = Math.max(interval.start, 0);
    const stop = Math.max(interval.stop, start);

    return {
        start: document.positionAt(start),
        end: document.positionAt(stop + 1),
    };
}

export function sameRange(left: Range, right: Range): boolean {
    return (
        left.start.line === right.start.line &&
        left.start.character === right.start.character &&
        left.end.line === right.end.line &&
        left.end.character === right.end.character
    );
}

export function rangeContainsPosition(range: Range, position: Position): boolean {
    return (
        comparePositions(range.start, position) <= 0 && comparePositions(position, range.end) <= 0
    );
}

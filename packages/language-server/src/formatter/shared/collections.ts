import type { ParseTree, TerminalNode, Token } from "antlr4ng";
import type * as jsoniq from "server/parser/adapters/jsoniq/grammar/JsoniqParser.js";
import type * as xquery from "server/parser/adapters/xquery/grammar/XQueryParser.js";

import { composeTokenDoc, type TokenDoc } from "../context.js";
import { concat, type Doc, group, hardline, indent, line, softline, space } from "../doc.js";
import { groupStartingWith } from "../helpers.js";
import { formatTokenSeparatedDocs } from "./tokens.js";

type SourceTerminal = TerminalNode | TerminalNode[] | Token | null | undefined;
type FormatTerminal = (terminal: SourceTerminal, expectedToken: number | string) => Doc;
type FormatToken = (terminal: SourceTerminal, expectedToken: number | string) => TokenDoc;
type Visit = (node: ParseTree | null | undefined) => Doc;

type SquareArrayConstructor =
    | jsoniq.SquareArrayConstructorContext
    | xquery.SquareArrayConstructorContext;
type CurlyArrayConstructor =
    | jsoniq.CurlyArrayConstructorContext
    | xquery.CurlyArrayConstructorContext;
type PostfixExpression = jsoniq.PostfixExprContext | xquery.PostfixExprContext;
type ParenthesizedExpression = jsoniq.ParenthesizedExprContext | xquery.ParenthesizedExprContext;
type FunctionCall = jsoniq.FunctionCallContext | xquery.FunctionCallContext;
type ArgumentList = jsoniq.ArgumentListContext | xquery.ArgumentListContext;
type Argument = jsoniq.ArgumentContext | xquery.ArgumentContext;

export function formatPairObjectConstructor(
    firstToken: TokenDoc,
    afterFirstToken: Doc,
    rightBrace: Doc,
    pairs: readonly Doc[],
    commas: readonly TerminalNode[],
    formatTerminal: FormatTerminal,
): Doc {
    const opening = concat([composeTokenDoc(firstToken), afterFirstToken]);
    if (pairs.length === 0) {
        return concat([opening, rightBrace]);
    }

    const formatPairs = (breakDoc: Doc): Doc =>
        formatTokenSeparatedDocs(pairs, commas, (comma) => formatTerminal(comma, ","), breakDoc);
    if (pairs.length > 2) {
        return concat([
            opening,
            indent(concat([hardline, formatPairs(hardline)])),
            hardline,
            rightBrace,
        ]);
    }

    return groupStartingWith(
        firstToken,
        concat([afterFirstToken, indent(concat([line, formatPairs(line)])), line, rightBrace]),
    );
}

export function formatSquareArrayConstructor(
    node: SquareArrayConstructor,
    commaTokenType: number,
    visit: Visit,
    formatToken: FormatToken,
    formatTerminal: FormatTerminal,
): Doc {
    const leftBracket = formatToken(node.LBRACKET(), "[");
    const rightBracket = formatTerminal(node.RBRACKET(), "]");
    const items = node.exprSingle().map(visit);
    if (items.length === 0) {
        return concat([composeTokenDoc(leftBracket), rightBracket]);
    }
    return groupStartingWith(
        leftBracket,
        concat([
            indent(
                concat([
                    line,
                    formatTokenSeparatedDocs(items, node.getTokens(commaTokenType), (comma) =>
                        formatTerminal(comma, ","),
                    ),
                ]),
            ),
            line,
            rightBracket,
        ]),
    );
}

export function formatCurlyArrayConstructor(
    node: CurlyArrayConstructor,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([
        formatTerminal(node.KW_ARRAY(), "array"),
        space,
        visit(node.enclosedExpression()),
    ]);
}

export function formatPostfixExpression(node: PostfixExpression, visit: Visit): Doc {
    const parts: Doc[] = [];
    for (let index = 0; index < node.getChildCount(); index++) {
        parts.push(visit(node.getChild(index)));
    }
    return concat(parts);
}

function formatParenthesizedList(
    leftParenthesis: SourceTerminal,
    rightParenthesis: SourceTerminal,
    items: Doc[],
    commas: TerminalNode[],
    formatTerminal: FormatTerminal,
): Doc {
    const left = formatTerminal(leftParenthesis, "(");
    const right = formatTerminal(rightParenthesis, ")");
    if (items.length === 0) {
        return concat([left, right]);
    }
    return concat([
        left,
        group(
            concat([
                indent(
                    concat([
                        softline,
                        formatTokenSeparatedDocs(items, commas, (comma) =>
                            formatTerminal(comma, ","),
                        ),
                    ]),
                ),
                softline,
                right,
            ]),
        ),
    ]);
}

export function formatParenthesizedExpression(
    node: ParenthesizedExpression,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const expression = node.expr();
    const items = expression
        ? "exprSingle" in expression && typeof expression.exprSingle === "function"
            ? expression.exprSingle().map(visit)
            : [visit(expression)]
        : [];
    return formatParenthesizedList(
        node.LPAREN(),
        node.RPAREN(),
        items,
        node.getTokens(commaTokenType),
        formatTerminal,
    );
}

export function formatFunctionCall(node: FunctionCall, visit: Visit): Doc {
    return concat([visit(node._fn_name), visit(node.argumentList())]);
}

export function formatArgumentList(
    node: ArgumentList,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return formatParenthesizedList(
        node.LPAREN(),
        node.RPAREN(),
        node.argument().map(visit),
        node.getTokens(commaTokenType),
        formatTerminal,
    );
}

export function formatArgument(node: Argument, visit: Visit, formatTerminal: FormatTerminal): Doc {
    return node.QUESTION() !== null
        ? formatTerminal(node.QUESTION(), "?")
        : visit(node.exprSingle());
}

import { ParserRuleContext, TerminalNode, Token } from "antlr4ng";

import { composeTokenDoc, FormatterContext, type TokenDoc } from "../context.js";
import { concat, type Doc, group, hardline, indent, join, line, softline } from "../doc.js";
import { getTokenLiteral } from "../helpers.js";

type SourceTerminal = TerminalNode | Token | null | undefined;

interface DirectAttributeList extends ParserRuleContext {
    qname(): ParserRuleContext[];
    dirAttributeValue(): DirectAttributeValue[];
    EQUAL(index: number): TerminalNode | null;
}

interface DirectAttributeValue extends ParserRuleContext {
    dirAttributeValueQuot(): DirectAttributeValueQuot | null;
    dirAttributeValueApos(): DirectAttributeValueApos | null;
}

interface DirectAttributeValueQuot extends ParserRuleContext {
    Quot(index: number): TerminalNode | null;
    dirAttributeContentQuot(): EnclosedExpressionCandidate[];
}

interface DirectAttributeValueApos extends ParserRuleContext {
    Apos(index: number): TerminalNode | null;
    dirAttributeContentApos(): EnclosedExpressionCandidate[];
}

interface EnclosedExpressionCandidate extends ParserRuleContext {
    expr(): ParserRuleContext | null;
    LBRACE(index: number): TerminalNode | null;
    RBRACE(index: number): TerminalNode | null;
}

export interface EnclosedExpressionContent extends EnclosedExpressionCandidate {
    expr(): ParserRuleContext;
}

export type FormatEnclosedExpression = (node: EnclosedExpressionContent) => Doc;

interface DirectElementOpenClose extends ParserRuleContext {
    RANGLE(index: number): TerminalNode | null;
    LANGLE(): TerminalNode;
    dirElemContent(): DirectElementContent[];
}

interface DirectElementContent extends ParserRuleContext {
    directConstructor(): DirectConstructor | null;
    commonContent(): ParserRuleContext | null;
}

interface DirectElementSingleTag extends ParserRuleContext {
    SLASH(): TerminalNode;
    RANGLE(): TerminalNode;
}

/** The shared structural shape of JSONiq and XQuery direct constructors. */
export interface DirectConstructor extends ParserRuleContext {
    LANGLE(): TerminalNode | null;
    qname(): ParserRuleContext | null;
    dirAttributeList(): DirectAttributeList | null;
    dirElemConstructorOpenClose(): DirectElementOpenClose | null;
    dirElemConstructorSingleTag(): DirectElementSingleTag | null;
}

export interface XmlTokenTypes {
    readonly LANGLE: number;
    readonly RANGLE: number;
    readonly EQUAL: number;
    readonly SLASH: number;
}

/**
 * Formats a source token, synthesizing text only for omitted generated accessors.
 */
export function formatTokenDoc(
    context: FormatterContext,
    terminal: SourceTerminal | SourceTerminal[],
    expectedToken: number | string,
    literalNames: (string | null)[],
): TokenDoc {
    if (Array.isArray(terminal)) {
        terminal = terminal[0] ?? null;
    }
    if (terminal) {
        return context.formatToken(terminal);
    }

    const expected =
        typeof expectedToken === "number"
            ? getTokenLiteral(expectedToken, literalNames)
            : expectedToken;
    return context.formatSyntheticToken(expected);
}

/**
 * Formats direct XML tag markup. XML boundary whitespace is policy-sensitive,
 * but nested tag markup can always be formatted independently.
 */
export function formatDirectConstructor(
    context: FormatterContext,
    tokens: XmlTokenTypes,
    node: DirectConstructor,
    formatTerminal: (terminal: SourceTerminal, expectedToken: number) => Doc,
    formatEnclosedExpression: FormatEnclosedExpression,
): Doc {
    const openAngle = node.LANGLE();
    const name = node.qname();
    const attributes = node.dirAttributeList();
    const openClose = node.dirElemConstructorOpenClose();
    const singleTag = node.dirElemConstructorSingleTag();

    if (!openAngle || !name || !attributes || (!openClose && !singleTag)) {
        return composeTokenDoc(context.formatTokenRange(node.start!, node.stop!));
    }

    const tagStart = concat([
        formatTerminal(openAngle, tokens.LANGLE),
        context.formatVerbatimRange(name.start!, name.stop!),
    ]);
    const attributeDocs = formatDirectAttributes(
        context,
        tokens,
        attributes,
        formatTerminal,
        formatEnclosedExpression,
    );

    if (singleTag) {
        return formatDirectTag(
            tagStart,
            attributeDocs,
            concat([
                formatTerminal(singleTag.SLASH(), tokens.SLASH),
                formatTerminal(singleTag.RANGLE(), tokens.RANGLE),
            ]),
        );
    }

    if (!openClose) {
        return composeTokenDoc(context.formatTokenRange(node.start!, node.stop!));
    }

    const openingTag = formatDirectTag(
        tagStart,
        attributeDocs,
        formatTerminal(openClose.RANGLE(0), tokens.RANGLE),
    );
    return concat([
        openingTag,
        formatDirectBody(context, tokens, openClose, formatTerminal, formatEnclosedExpression),
    ]);
}

function formatDirectBody(
    context: FormatterContext,
    tokens: XmlTokenTypes,
    node: DirectElementOpenClose,
    formatTerminal: (terminal: SourceTerminal, expectedToken: number) => Doc,
    formatEnclosedExpression: FormatEnclosedExpression,
): Doc {
    const contents = node.dirElemContent();
    const hasDirectConstructor = contents.some((content) => content.directConstructor() !== null);
    if (
        context.canReflowXmlBoundaryWhitespace() &&
        hasOnlyStructuralContent(context, node, contents) &&
        (contents.length > 1 || hasDirectConstructor)
    ) {
        const childDocs = contents.map((content) =>
            formatDirectContent(context, tokens, content, formatTerminal, formatEnclosedExpression),
        );
        const closingTag = context.formatVerbatimRange(node.LANGLE().symbol, node.stop!);

        if (!hasDirectConstructor) {
            return group(
                concat([
                    indent(concat([softline, join(softline, childDocs)])),
                    softline,
                    closingTag,
                ]),
            );
        }

        return concat([
            indent(concat([hardline, join(hardline, childDocs)])),
            hardline,
            closingTag,
        ]);
    }

    return formatBodyWithOriginalWhitespace(
        context,
        tokens,
        node,
        contents,
        formatTerminal,
        formatEnclosedExpression,
    );
}

function formatBodyWithOriginalWhitespace(
    context: FormatterContext,
    tokens: XmlTokenTypes,
    node: DirectElementOpenClose,
    contents: readonly DirectElementContent[],
    formatTerminal: (terminal: SourceTerminal, expectedToken: number) => Doc,
    formatEnclosedExpression: FormatEnclosedExpression,
): Doc {
    const openingEnd = node.RANGLE(0)?.symbol;
    if (!openingEnd) {
        return context.formatVerbatimRange(node.LANGLE().symbol, node.stop!);
    }

    const docs: Doc[] = [];
    let previous = openingEnd;
    for (const content of contents) {
        docs.push(context.formatVerbatimBetween(previous, content.start!));
        docs.push(
            formatDirectContent(context, tokens, content, formatTerminal, formatEnclosedExpression),
        );
        previous = content.stop!;
    }
    docs.push(context.formatVerbatimBetween(previous, node.LANGLE().symbol));
    docs.push(context.formatVerbatimRange(node.LANGLE().symbol, node.stop!));
    return concat(docs);
}

function formatDirectContent(
    context: FormatterContext,
    tokens: XmlTokenTypes,
    content: DirectElementContent,
    formatTerminal: (terminal: SourceTerminal, expectedToken: number) => Doc,
    formatEnclosedExpression: FormatEnclosedExpression,
): Doc {
    const childElement = content.directConstructor();
    if (childElement) {
        return formatDirectConstructor(
            context,
            tokens,
            childElement,
            formatTerminal,
            formatEnclosedExpression,
        );
    }

    const commonContent = content.commonContent();
    if (commonContent && isEnclosedExpressionContent(commonContent)) {
        return formatEnclosedExpression(commonContent);
    }
    return context.formatVerbatimRange(content.start!, content.stop!);
}

function hasOnlyStructuralContent(
    context: FormatterContext,
    node: DirectElementOpenClose,
    contents: readonly DirectElementContent[],
): boolean {
    let previous = node.RANGLE(0)?.symbol;
    if (!previous) {
        return false;
    }

    for (const content of contents) {
        if (!context.hasOnlyWhitespaceBetween(previous, content.start!)) {
            return false;
        }
        if (!isStructuralContent(content)) {
            return false;
        }
        previous = content.stop!;
    }

    return context.hasOnlyWhitespaceBetween(previous, node.LANGLE().symbol);
}

function isStructuralContent(content: DirectElementContent): boolean {
    const commonContent = content.commonContent();
    return (
        content.directConstructor() !== null ||
        (commonContent !== null && isEnclosedExpressionContent(commonContent))
    );
}

function formatDirectAttributes(
    context: FormatterContext,
    tokens: XmlTokenTypes,
    node: DirectAttributeList,
    formatTerminal: (terminal: SourceTerminal, expectedToken: number) => Doc,
    formatEnclosedExpression: FormatEnclosedExpression,
): Doc[] {
    const names = node.qname();
    const values = node.dirAttributeValue();

    return names.map((name, index) =>
        concat([
            context.formatVerbatimRange(name.start!, name.stop!),
            formatTerminal(node.EQUAL(index), tokens.EQUAL),
            formatDirectAttributeValue(
                context,
                values[index]!,
                formatTerminal,
                formatEnclosedExpression,
            ),
        ]),
    );
}

function formatDirectAttributeValue(
    context: FormatterContext,
    value: DirectAttributeValue,
    formatTerminal: (terminal: SourceTerminal, expectedToken: number) => Doc,
    formatEnclosedExpression: FormatEnclosedExpression,
): Doc {
    const quoted = value.dirAttributeValueQuot();
    if (quoted) {
        return formatDelimitedAttributeValue(
            context,
            value,
            quoted.Quot(0),
            quoted.Quot(1),
            quoted.dirAttributeContentQuot(),
            formatTerminal,
            formatEnclosedExpression,
        );
    }

    const apostrophe = value.dirAttributeValueApos();
    if (apostrophe) {
        return formatDelimitedAttributeValue(
            context,
            value,
            apostrophe.Apos(0),
            apostrophe.Apos(1),
            apostrophe.dirAttributeContentApos(),
            formatTerminal,
            formatEnclosedExpression,
        );
    }

    return context.formatVerbatimRange(value.start!, value.stop!);
}

function formatDelimitedAttributeValue(
    context: FormatterContext,
    value: DirectAttributeValue,
    openQuote: TerminalNode | null,
    closeQuote: TerminalNode | null,
    contents: readonly EnclosedExpressionCandidate[],
    formatTerminal: (terminal: SourceTerminal, expectedToken: number) => Doc,
    formatEnclosedExpression: FormatEnclosedExpression,
): Doc {
    const expressions = contents.filter(isEnclosedExpressionContent);
    if (expressions.length === 0 || !openQuote || !closeQuote) {
        return context.formatVerbatimRange(value.start!, value.stop!);
    }

    const docs: Doc[] = [formatTerminal(openQuote, openQuote.symbol.type)];
    let previous = openQuote.symbol;
    for (const expression of expressions) {
        docs.push(context.formatVerbatimBetween(previous, expression.start!));
        docs.push(formatEnclosedExpression(expression));
        previous = expression.stop!;
    }
    docs.push(context.formatVerbatimBetween(previous, closeQuote.symbol));
    docs.push(formatTerminal(closeQuote, closeQuote.symbol.type));
    return concat(docs);
}

function isEnclosedExpressionContent(node: ParserRuleContext): node is EnclosedExpressionContent {
    if (!("expr" in node && "LBRACE" in node && "RBRACE" in node)) {
        return false;
    }
    return (node as EnclosedExpressionCandidate).expr() !== null;
}

function formatDirectTag(tagStart: Doc, attributes: readonly Doc[], close: Doc): Doc {
    if (attributes.length === 0) {
        return concat([tagStart, close]);
    }

    return group(
        concat([tagStart, indent(concat([line, join(line, attributes)])), softline, close]),
    );
}

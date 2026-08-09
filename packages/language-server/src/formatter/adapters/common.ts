import { ParserRuleContext, TerminalNode, Token } from "antlr4ng";

import { composeTokenDoc, FormatterContext, type TokenDoc } from "../context.js";
import { concat, type Doc, group, indent, join, line, softline } from "../doc.js";
import { getTokenLiteral } from "../helpers.js";

type SourceTerminal = TerminalNode | Token | null | undefined;

interface DirectAttributeList extends ParserRuleContext {
    qname(): ParserRuleContext[];
    dirAttributeValue(): ParserRuleContext[];
    EQUAL(index: number): TerminalNode | null;
}

interface DirectElementOpenClose extends ParserRuleContext {
    RANGLE(index: number): TerminalNode | null;
    LANGLE(): TerminalNode;
    dirElemContent(): ParserRuleContext[];
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
 * Formats direct XML tag markup while retaining its body as verbatim source.
 * XML content can carry semantic whitespace, so body reflow is deliberately a
 * separate, policy-aware phase.
 */
export function formatDirectConstructor(
    context: FormatterContext,
    tokens: XmlTokenTypes,
    node: DirectConstructor,
    formatTerminal: (terminal: SourceTerminal, expectedToken: number) => Doc,
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
    const attributeDocs = formatDirectAttributes(context, tokens, attributes, formatTerminal);

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
    const bodyStart = openClose.dirElemContent()[0]?.start ?? openClose.LANGLE().symbol;

    return concat([openingTag, context.formatVerbatimRange(bodyStart, openClose.stop!)]);
}

function formatDirectAttributes(
    context: FormatterContext,
    tokens: XmlTokenTypes,
    node: DirectAttributeList,
    formatTerminal: (terminal: SourceTerminal, expectedToken: number) => Doc,
): Doc[] {
    const names = node.qname();
    const values = node.dirAttributeValue();

    return names.map((name, index) =>
        concat([
            context.formatVerbatimRange(name.start!, name.stop!),
            formatTerminal(node.EQUAL(index), tokens.EQUAL),
            context.formatVerbatimRange(values[index]!.start!, values[index]!.stop!),
        ]),
    );
}

function formatDirectTag(tagStart: Doc, attributes: readonly Doc[], close: Doc): Doc {
    if (attributes.length === 0) {
        return concat([tagStart, close]);
    }

    return group(
        concat([tagStart, indent(concat([line, join(line, attributes)])), softline, close]),
    );
}

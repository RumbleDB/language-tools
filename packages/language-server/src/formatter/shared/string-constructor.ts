import type { ParseTree, ParserRuleContext, TerminalNode } from "antlr4ng";
import type * as jsoniq from "server/parser/adapters/jsoniq/grammar/JsoniqParser.js";
import type * as xquery from "server/parser/adapters/xquery/grammar/XQueryParser.js";

import { composeTokenDoc, type FormatterContext } from "../context.js";
import { concat, type Doc, space } from "../doc.js";

interface StringInterpolation extends ParserRuleContext {
    ENTER_INTERPOLATION(): TerminalNode;
    EXIT_INTERPOLATION(): TerminalNode;
    expr(): ParseTree;
}

interface StringContent extends ParserRuleContext {
    stringConstructorInterpolation(): StringInterpolation[];
}

type StringConstructor = jsoniq.StringConstructorContext | xquery.StringConstructorContext;

/** Preserves literal template text while formatting embedded expressions. */
export function formatStringConstructor(
    context: FormatterContext,
    node: StringConstructor,
    visit: (node: ParseTree | null | undefined) => Doc,
): Doc {
    const open = node.ENTER_STRING();
    const close = node.EXIT_STRING();
    const content = node.stringConstructorContent() as StringContent;
    const interpolations = content.stringConstructorInterpolation();
    if (interpolations.length === 0) {
        return composeTokenDoc(context.formatTokenRange(node.start!, node.stop!));
    }

    const docs: Doc[] = [composeTokenDoc(context.formatToken(open))];
    let previous = open.symbol;
    for (const interpolation of interpolations) {
        docs.push(context.formatVerbatimBetween(previous, interpolation.start!));
        docs.push(
            composeTokenDoc(context.formatToken(interpolation.ENTER_INTERPOLATION())),
            space,
            visit(interpolation.expr()),
            space,
            composeTokenDoc(context.formatToken(interpolation.EXIT_INTERPOLATION())),
        );
        previous = interpolation.stop!;
    }
    docs.push(context.formatVerbatimBetween(previous, close.symbol));
    docs.push(composeTokenDoc(context.formatToken(close)));
    return concat(docs);
}

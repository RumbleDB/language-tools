import type { ParseTree, ParserRuleContext, TerminalNode } from "antlr4ng";
import type * as ctx from "server/parser/context.js";

import { composeTokenDoc, type FormatterContext } from "../context.js";
import { concat, type Doc, flat, space } from "../doc.js";
import { formatSourceRange } from "./tokens.js";

interface StringInterpolation extends ParserRuleContext {
    ENTER_INTERPOLATION(): TerminalNode;
    EXIT_INTERPOLATION(): TerminalNode;
    expr(): ParseTree;
}

interface StringContent extends ParserRuleContext {
    stringConstructorInterpolation(): StringInterpolation[];
}

/**
 * Preserves literal template text while formatting embedded expressions. An embedded expression stays on one line,
 * because a line break in it cannot shorten the template text around it.
 */
export function formatStringConstructor(
    context: FormatterContext,
    node: ctx.StringConstructorContext,
    visit: (node: ParseTree | null | undefined) => Doc,
): Doc {
    const open = node.ENTER_STRING();
    const close = node.EXIT_STRING();
    const content = node.stringConstructorContent() as StringContent;
    const interpolations = content.stringConstructorInterpolation();
    if (interpolations.length === 0) {
        return formatSourceRange(context, node);
    }

    const text = context.formatBetweenSourceText(
        open.symbol,
        interpolations,
        close.symbol,
        (interpolation) =>
            concat([
                composeTokenDoc(context.formatToken(interpolation.ENTER_INTERPOLATION())),
                space,
                flat(visit(interpolation.expr())),
                space,
                composeTokenDoc(context.formatToken(interpolation.EXIT_INTERPOLATION())),
            ]),
    );
    return concat([
        composeTokenDoc(context.formatToken(open)),
        text,
        composeTokenDoc(context.formatToken(close)),
    ]);
}

import { type ParseTree, type ParserRuleContext, TerminalNode } from "antlr4ng";

import { concat, type Doc, space } from "../doc.js";

export interface CompactTokenTypes {
    readonly COMMA: number;
    readonly KW_AS: number;
}

/**
 * Formats syntax whose parts are written together, such as path steps (`$doc//book/@id`,
 * `child::a[1]`) and type tests (`element(a, xs:string)`), without spaces between the parts.
 * Commas in argument-like lists are followed by a space, and `as` in a function test is spaced.
 */
export function formatCompact(
    node: ParserRuleContext,
    tokens: CompactTokenTypes,
    visit: (node: ParseTree) => Doc,
): Doc {
    return concat(
        node.children.map((child) => {
            const doc = visit(child);
            if (!(child instanceof TerminalNode)) {
                return doc;
            }
            if (child.symbol.type === tokens.COMMA) {
                return concat([doc, space]);
            }
            if (child.symbol.type === tokens.KW_AS) {
                return concat([space, doc, space]);
            }
            return doc;
        }),
    );
}

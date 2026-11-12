import { FormatterContext } from "server/formatter/context.js";
import { FormatterVisitor } from "server/formatter/visitor.js";
import { XQueryLexer } from "server/parser/adapters/xquery/grammar/XQueryLexer.js";
import { XQueryParser } from "server/parser/adapters/xquery/grammar/XQueryParser.js";

/** Formats XQuery, whose syntax the shared visitor covers. */
export class XQueryFormatterVisitor extends FormatterVisitor {
    public constructor(ctx: FormatterContext) {
        super(ctx, { parser: XQueryParser, literalNames: XQueryLexer.literalNames });
    }
}

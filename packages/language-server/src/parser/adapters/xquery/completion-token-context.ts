import { TokenContextAnalyzer } from "server/parser/completion-context.js";

import { XQueryLexer } from "./grammar/XQueryLexer.js";

export class XQueryTokenContextAnalyzer extends TokenContextAnalyzer {
    protected override get ncNameTokenType(): number {
        return XQueryLexer.NCName;
    }

    protected override get colonTokenType(): number {
        return XQueryLexer.COLON;
    }

    protected override get dollarTokenType(): number {
        return XQueryLexer.DOLLAR;
    }

    protected override get lexerSymbolicNames(): ReadonlyArray<string | null> {
        return XQueryLexer.symbolicNames;
    }
}
